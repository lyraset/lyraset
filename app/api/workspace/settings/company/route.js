import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission, HttpError } from '@/lib/workspace/auth';
import { api, json, readJson } from '@/lib/workspace/route';
import { parseBody } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import Settings, { SINGLETON_KEY } from '@/models/workspace/Settings';
import { ensureSettings, getWorkspaceContext } from '@/lib/workspace/context';
import { getCycleForDate, getNextCycle } from '@/lib/workspace/calc/cycle';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  cycleStartDay: z.coerce.number().int().min(1).max(28).optional(),

  monthlyLeaveQuota: z.coerce.number().min(0).max(31).optional(),
  leaveCarryForward: z.enum(['LAPSE', 'CARRY']).optional(),
  maxCarryForward: z.coerce.number().min(0).max(31).optional(),
  overQuotaBehavior: z.enum(['BLOCK', 'CONVERT_TO_UNPAID']).optional(),
  sandwichRule: z.boolean().optional(),

  halfDayThresholdPercent: z.coerce.number().int().min(1).max(100).optional(),
  autoClockOutOffsetHours: z.coerce.number().int().min(1).max(24).optional(),
  paidBreaks: z.boolean().optional(),
  lateToDeduction: z
    .object({
      lateCount: z.coerce.number().int().min(0).max(31),
      deductionDays: z.coerce.number().min(0).max(5),
    })
    .optional(),

  eodEditWindowHours: z.coerce.number().int().min(0).max(168).optional(),
  eodMinDescriptionLength: z.coerce.number().int().min(0).max(2000).optional(),
});

export const GET = api(async () => {
  await requireApiPermission(P.SETTINGS_MANAGE);
  const settings = await ensureSettings();
  const ctx = await getWorkspaceContext();
  const current = getCycleForDate(new Date(), ctx.cycleHistory, 'Asia/Karachi');
  const next = getNextCycle(new Date(), ctx.cycleHistory, 'Asia/Karachi');

  const { _id, __v, ...rest } = settings;
  return json({
    settings: { id: String(_id), ...rest },
    currentCycle: current,
    nextCycle: next,
    cycleStartDay: ctx.cycleHistory.at(-1)?.day ?? 1,
  });
});

/**
 * Update company settings.
 *
 * A change to the company month start day is appended to the history with the
 * next cycle's start as its effective date, never applied retroactively — past
 * cycles keep the boundaries they were reported and paid on.
 */
export const PATCH = api(async (req) => {
  const actor = await requireApiPermission(P.SETTINGS_MANAGE);
  const data = parseBody(Schema, await readJson(req));

  await connectDB();
  const before = await ensureSettings();
  const { cycleStartDay, ...rest } = data;

  if (rest.leaveCarryForward === 'CARRY' && (rest.maxCarryForward ?? before.maxCarryForward) <= 0) {
    throw new HttpError(400, 'Set a maximum carry-forward above zero, or choose Lapse.');
  }

  const update = { $set: { ...rest, updatedBy: actor.id } };

  if (cycleStartDay != null) {
    const ctx = await getWorkspaceContext();
    const currentDay = ctx.cycleHistory.at(-1)?.day ?? 1;
    if (cycleStartDay !== currentDay) {
      // Effective from the start of the next cycle under the current rule.
      const next = getNextCycle(new Date(), ctx.cycleHistory, 'Asia/Karachi');
      update.$push = { cycleStartHistory: { day: cycleStartDay, effectiveFrom: next.start } };
    }
  }

  await Settings.updateOne({ key: SINGLETON_KEY }, update, { runValidators: true });
  const after = await Settings.findOne({ key: SINGLETON_KEY }).lean();

  await logAudit({
    actorId: actor.id,
    action: 'settings.company.update',
    targetType: 'settings',
    targetId: SINGLETON_KEY,
    before: stripMeta(before),
    after: stripMeta(after),
    req,
  });

  const { _id, __v, ...clean } = after;
  return json({
    settings: { id: String(_id), ...clean },
    cycleChangeEffectiveFrom: update.$push?.cycleStartHistory?.effectiveFrom ?? null,
  });
});

function stripMeta(doc) {
  if (!doc) return null;
  const { _id, __v, createdAt, updatedAt, ...rest } = doc;
  return rest;
}
