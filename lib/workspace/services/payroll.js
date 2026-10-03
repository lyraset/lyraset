import 'server-only';
import { DateTime } from 'luxon';
import PayrollPeriod from '../../../models/workspace/PayrollPeriod.js';
import { connectDB } from '../db.js';
import { getWorkspaceContext } from '../context.js';
import { listCycles, getCycleForDate } from '../calc/cycle.js';
import { TIMEZONE } from '../timezone.js';
import { HttpError } from '../auth.js';
import { logAudit } from '../audit.js';
import { OFFICES } from '../../../models/workspace/User.js';

/**
 * Locking a company month.
 *
 * A locked period is read-only for everyone, the Owner included. The check
 * itself lives in context.assertPeriodOpen, which every dated write calls, so
 * "locked" is enforced at the data layer rather than by each page remembering.
 *
 * Unlocking requires a reason and keeps a history, because the point of the
 * lock is that payroll was signed off on those numbers.
 */

/** The cycles an office can review, newest first, with their lock state. */
export async function listPeriods({ office, months = 12, now = new Date() }) {
  const ctx = await getWorkspaceContext();
  const tz = TIMEZONE;
  await connectDB();

  const end = DateTime.fromJSDate(now, { zone: tz });
  const start = end.minus({ months });
  const cycles = listCycles(start.toJSDate(), end.toJSDate(), ctx.cycleHistory, tz);

  const existing = await PayrollPeriod.find({
    office,
    cycleKey: { $in: cycles.map((c) => c.key) },
  }).lean();
  const byKey = new Map(existing.map((p) => [p.cycleKey, p]));

  return cycles
    .map((cycle) => {
      const period = byKey.get(cycle.key);
      return {
        office,
        cycleKey: cycle.key,
        cycleLabel: cycle.label,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        status: period?.status ?? 'OPEN',
        lockedAt: period?.lockedAt ?? null,
        lockedBy: period?.lockedBy ? String(period.lockedBy) : null,
        unlockCount: period?.unlockHistory?.length ?? 0,
        // A cycle still running should not be locked by accident.
        isCurrent:
          end >= DateTime.fromJSDate(cycle.start, { zone: tz }) &&
          end <= DateTime.fromJSDate(cycle.end, { zone: tz }),
      };
    })
    .reverse();
}

/**
 * Lock a cycle for one office.
 *
 * The period stores its own start and end dates, so a later change to the
 * company month start day cannot move the boundaries of something already
 * signed off.
 */
export async function lockPeriod({ actor, office, cycleKey, req = null, now = new Date() }) {
  const ctx = await getWorkspaceContext();
  if (!OFFICES.includes(office)) throw new HttpError(400, 'Pick a valid office.');
  await connectDB();

  const tz = TIMEZONE;
  const anchor = DateTime.fromISO(cycleKey + '-15', { zone: tz });
  if (!anchor.isValid) throw new HttpError(400, 'That is not a valid cycle.');
  const cycle = getCycleForDate(anchor.toJSDate(), ctx.cycleHistory, tz);

  if (DateTime.fromJSDate(now, { zone: tz }) <= DateTime.fromJSDate(cycle.end, { zone: tz })) {
    throw new HttpError(
      409,
      'The ' + cycle.label + ' cycle has not finished yet. Lock it after ' + cycle.endDate + '.'
    );
  }

  const existing = await PayrollPeriod.findOne({ office, cycleKey: cycle.key }).lean();
  if (existing?.status === 'LOCKED') {
    throw new HttpError(409, 'That period is already locked.');
  }

  await PayrollPeriod.updateOne(
    { office, cycleKey: cycle.key },
    {
      $set: {
        status: 'LOCKED',
        lockedBy: actor.id,
        lockedAt: now,
        cycleLabel: cycle.label,
        startDate: cycle.start,
        endDate: cycle.end,
      },
      $setOnInsert: { office, cycleKey: cycle.key },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );

  await logAudit({
    actorId: actor.id,
    action: 'payroll.lock',
    targetType: 'payroll_period',
    targetId: office + ':' + cycle.key,
    before: { status: existing?.status ?? 'OPEN' },
    after: { status: 'LOCKED' },
    meta: { office, cycleKey: cycle.key, cycleLabel: cycle.label },
    req,
  });

  const fresh = await PayrollPeriod.findOne({ office, cycleKey: cycle.key }).lean();
  return serializePeriod(fresh);
}

/** Unlock a cycle. A reason is required and kept. */
export async function unlockPeriod({
  actor,
  office,
  cycleKey,
  reason,
  req = null,
  now = new Date(),
}) {
  await connectDB();
  if (!reason || String(reason).trim().length < 5) {
    throw new HttpError(
      400,
      'Give a reason for unlocking this period — it is kept in the audit log.'
    );
  }

  const period = await PayrollPeriod.findOne({ office, cycleKey }).lean();
  if (!period || period.status !== 'LOCKED') {
    throw new HttpError(409, 'That period is not locked.');
  }

  await PayrollPeriod.updateOne(
    { _id: period._id, status: 'LOCKED' },
    {
      $set: { status: 'OPEN', lockedBy: null, lockedAt: null },
      $push: { unlockHistory: { at: now, by: actor.id, reason: String(reason).trim() } },
    }
  );

  await logAudit({
    actorId: actor.id,
    action: 'payroll.unlock',
    targetType: 'payroll_period',
    targetId: office + ':' + cycleKey,
    before: { status: 'LOCKED' },
    after: { status: 'OPEN' },
    meta: { office, cycleKey, reason },
    req,
  });

  const fresh = await PayrollPeriod.findOne({ _id: period._id }).lean();
  return serializePeriod(fresh);
}

export function serializePeriod(period) {
  if (!period) return null;
  return {
    id: String(period._id),
    office: period.office,
    cycleKey: period.cycleKey,
    cycleLabel: period.cycleLabel ?? null,
    startDate: period.startDate,
    endDate: period.endDate,
    status: period.status,
    lockedAt: period.lockedAt ?? null,
    lockedBy: period.lockedBy ? String(period.lockedBy) : null,
    unlockHistory: (period.unlockHistory ?? []).map((u) => ({
      at: u.at,
      by: u.by ? String(u.by) : null,
      reason: u.reason,
    })),
  };
}
