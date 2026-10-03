import 'server-only';
import { DateTime } from 'luxon';
import { connectDB } from '../db.js';
import Attendance from '../../../models/workspace/Attendance.js';
import Eod from '../../../models/workspace/Eod.js';
import LeaveRequest from '../../../models/workspace/LeaveRequest.js';
import WorkRequest from '../../../models/workspace/WorkRequest.js';
import User from '../../../models/workspace/User.js';
import {
  getWorkspaceContext,
  scheduleFor,
  workDateFor,
  cycleFor,
  officeFor,
  assertPeriodOpen,
} from '../context.js';
import {
  STATUS,
  computeDayStatus,
  computeBreakMinutes,
  computeWorkedMinutes,
  autoCloseAt,
  findHoliday,
} from '../calc/attendance.js';
import { TIMEZONE } from '../timezone.js';
import { HttpError } from '../auth.js';
import { ipAllowed, withinGeofence } from '../geo.js';
import { withTransaction, withSession } from './tx.js';
import { notify } from './notifications.js';

/**
 * Everything that reads or writes an attendance day.
 *
 * Two rules hold throughout:
 *   - the server stamps every timestamp. The browser may say where it is, but
 *     never when it is.
 *   - the day's numbers are always recomputed from the record and the schedule
 *     rather than incremented, so a correction, a newly added holiday or an
 *     approved leave all converge on the same answer.
 */

const BREAK_TYPES = new Set(['LUNCH', 'PRAYER', 'OTHER']);

/** Approved leave, WFH and official duty that touch a set of work dates. */
async function loadDayContext(userId, workDates) {
  const dates = [...new Set(workDates)];
  const [leaveRequests, workRequests] = await Promise.all([
    LeaveRequest.find({
      userId,
      status: { $in: ['APPROVED', 'PARTIALLY_APPROVED'] },
      approvedDates: { $in: dates },
    }).lean(),
    WorkRequest.find({
      userId,
      type: { $in: ['WFH', 'OFFICIAL_DUTY'] },
      status: 'APPROVED',
      dates: { $in: dates },
    }).lean(),
  ]);

  const leavesByDate = new Map();
  for (const req of leaveRequests) {
    for (const date of req.approvedDates ?? []) {
      if (!dates.includes(date)) continue;
      // Shaped for the calc layer, which asks only about this one day.
      leavesByDate.set(date, {
        from: date,
        to: date,
        halfDay: req.halfDay,
        hours: req.hours,
        status: 'APPROVED',
        leaveTypeId: req.leaveTypeId,
        requestId: req._id,
      });
    }
  }

  const flagsByDate = new Map();
  for (const req of workRequests) {
    for (const date of req.dates ?? []) {
      if (!dates.includes(date)) continue;
      const entry = flagsByDate.get(date) ?? { wfh: false, officialDuty: false };
      if (req.type === 'WFH') entry.wfh = true;
      if (req.type === 'OFFICIAL_DUTY') entry.officialDuty = true;
      flagsByDate.set(date, entry);
    }
  }

  return { leavesByDate, flagsByDate };
}

/** Compute one day for one user from already-loaded data. No database access. */
export function evaluateDay({ ctx, user, workDate, record, leave, flags, now = new Date() }) {
  const schedule = scheduleFor(ctx, user, workDate);
  const computed = computeDayStatus(schedule, record, leave ? [leave] : [], ctx.holidays, {
    rules: ctx.rules,
    office: user.office,
    now,
    requiresAttendance: user.requiresAttendance !== false,
    wfh: Boolean(flags?.wfh),
    officialDuty: Boolean(flags?.officialDuty),
  });
  return { schedule, computed };
}

/** The fields the attendance record carries from a computation. */
function computedFields(computed, schedule, cycleKey) {
  return {
    workedMinutes: computed.workedMinutes,
    requiredMinutes: computed.requiredMinutes,
    breakMinutes: computed.breakMinutes,
    lateByMinutes: computed.lateByMinutes,
    earlyByMinutes: computed.earlyByMinutes,
    overtimeMinutes: computed.overtimeMinutes,
    status: computed.status,
    flags: computed.flags,
    cycleKey,
    shiftId: schedule.shiftId || null,
    scheduleSource: schedule.source,
  };
}

/** Weekday, weekend or holiday overtime — they are reported separately. */
function overtimeCategoryFor(ctx, user, workDate, schedule) {
  if (findHoliday(ctx.holidays, workDate, user.office)) return 'HOLIDAY';
  return schedule.working ? 'WEEKDAY' : 'WEEKEND';
}

/**
 * Recompute and persist one day. Safe to call repeatedly — it is how every
 * approval, correction and calendar change settles back into the record.
 */
export async function recomputeDay({ user, workDate, ctx, now = new Date(), session = null }) {
  const context = ctx ?? (await getWorkspaceContext());
  await connectDB();

  const record = await Attendance.findOne({ userId: user.id ?? user._id, workDate })
    .session(session)
    .lean();
  if (!record) return null;

  const { leavesByDate, flagsByDate } = await loadDayContext(user.id ?? user._id, [workDate]);
  const { schedule, computed } = evaluateDay({
    ctx: context,
    user,
    workDate,
    record,
    leave: leavesByDate.get(workDate),
    flags: flagsByDate.get(workDate),
    now,
  });

  const cycle = cycleFor(context, workDate);
  await Attendance.updateOne(
    { _id: record._id },
    {
      $set: {
        ...computedFields(computed, schedule, cycle.key),
        overtimeCategory: overtimeCategoryFor(context, user, workDate, schedule),
      },
    },
    withSession(session)
  );

  return { record, schedule, computed, cycle };
}

/**
 * Close any session left open past its shift end plus the Owner's offset.
 *
 * Nothing schedules this. It runs whenever someone loads the dashboard or
 * clocks in, which is what keeps a saved shift length honest: without it, one
 * forgotten clock-out would record a twenty-hour day. The close is stamped at
 * the deadline, not at the moment it was noticed, so the recorded hours are
 * the hours the shift allowed.
 *
 * Idempotent: a session already closed is skipped, so two people loading the
 * portal at once produce one clock-out, not two.
 */
export async function autoCloseStaleSessions({
  userIds = null,
  now = new Date(),
  limit = 500,
} = {}) {
  const ctx = await getWorkspaceContext();
  await connectDB();

  const query = { clockIn: { $ne: null }, clockOut: null };
  if (userIds) query.userId = { $in: userIds };

  const open = await Attendance.find(query).limit(limit).lean();
  if (!open.length) return { closed: 0, records: [] };

  const users = await User.find({ _id: { $in: open.map((r) => r.userId) } }).lean();
  const usersById = new Map(users.map((u) => [String(u._id), u]));

  const closed = [];
  for (const record of open) {
    const user = usersById.get(String(record.userId));
    if (!user) continue;

    const schedule = scheduleFor(ctx, user, record.workDate);
    // Never earlier than the clock-in: a late clock-in is measured from itself.
    const cutoff = autoCloseAt(schedule, record.clockIn, ctx.rules);
    if (!cutoff || now < cutoff) continue;

    // Close at the deadline, not at "now": the employee did not work the hours
    // between the shift ending and someone noticing.
    const closeAt = cutoff;
    const updated = await Attendance.findOneAndUpdate(
      { _id: record._id, clockOut: null },
      {
        $set: {
          clockOut: closeAt,
          autoClosed: true,
          eodMissing: !record.eodId,
          // Any break still running is ended at the same moment.
          breaks: (record.breaks ?? []).map((b) => (b.end ? b : { ...b, end: closeAt })),
        },
      },
      { new: true }
    ).lean();
    if (!updated) continue; // someone clocked out in the meantime

    await recomputeDay({ user, workDate: record.workDate, ctx, now });
    await Attendance.updateOne({ _id: record._id }, { $set: { status: STATUS.MISSING_CLOCK_OUT } });

    await notify({
      userId: record.userId,
      type: 'AUTO_CLOCK_OUT',
      title: 'You were clocked out automatically',
      message:
        'Your session on ' +
        record.workDate +
        ' was still open, so it was closed at the end of your shift. Submit the EOD from your EOD history and ask for a correction if the times are wrong.',
      link: '/workspace/eod',
      dedupeKey: 'autoclose:' + String(record._id),
      settings: ctx.settings,
    });

    closed.push(updated);
  }

  return { closed: closed.length, records: closed };
}

/**
 * The state the dashboard renders: today's schedule, the live record, what the
 * employee may do next. Closes any stale session first, so someone who forgot
 * to clock out yesterday is not blocked from clocking in today.
 */
export async function getTodayState({ user, now = new Date() }) {
  const ctx = await getWorkspaceContext();
  await connectDB();

  await autoCloseStaleSessions({ userIds: [user.id], now });

  const workDate = workDateFor(ctx, user, now);
  const record = await Attendance.findOne({ userId: user.id, workDate }).lean();
  const { leavesByDate, flagsByDate } = await loadDayContext(user.id, [workDate]);
  const { schedule, computed } = evaluateDay({
    ctx,
    user,
    workDate,
    record,
    leave: leavesByDate.get(workDate),
    flags: flagsByDate.get(workDate),
    now,
  });

  const openBreak = (record?.breaks ?? []).find((b) => !b.end) ?? null;
  const eod = record?.eodId ? await Eod.findById(record.eodId).lean() : null;
  const office = officeFor(ctx, user.office);

  return {
    workDate,
    schedule,
    computed,
    record: record ? serializeRecord(record) : null,
    onBreak: Boolean(openBreak),
    openBreakStartedAt: openBreak?.start ?? null,
    clockedIn: Boolean(record?.clockIn && !record?.clockOut),
    clockedOut: Boolean(record?.clockOut),
    eodSubmitted: Boolean(eod),
    canClockIn: Boolean(!record?.clockIn),
    canClockOut: Boolean(record?.clockIn && !record?.clockOut),
    office,
    cycle: cycleFor(ctx, workDate),
  };
}

/** Attendance rows are sent to the browser as plain JSON. */
export function serializeRecord(record) {
  if (!record) return null;
  return {
    id: String(record._id),
    userId: String(record.userId),
    workDate: record.workDate,
    cycleKey: record.cycleKey ?? null,
    office: record.office,
    clockIn: record.clockIn ?? null,
    clockOut: record.clockOut ?? null,
    breaks: (record.breaks ?? []).map((b) => ({
      id: String(b._id),
      type: b.type,
      start: b.start,
      end: b.end ?? null,
    })),
    workedMinutes: record.workedMinutes ?? 0,
    requiredMinutes: record.requiredMinutes ?? 0,
    breakMinutes: record.breakMinutes ?? 0,
    lateByMinutes: record.lateByMinutes ?? 0,
    earlyByMinutes: record.earlyByMinutes ?? 0,
    overtimeMinutes: record.overtimeMinutes ?? 0,
    overtimeApproved: Boolean(record.overtimeApproved),
    overtimeApprovedMinutes: record.overtimeApprovedMinutes ?? 0,
    overtimeCategory: record.overtimeCategory ?? 'WEEKDAY',
    status: record.status,
    flags: record.flags ?? [],
    autoClosed: Boolean(record.autoClosed),
    eodMissing: Boolean(record.eodMissing),
    eodId: record.eodId ? String(record.eodId) : null,
    officialDutyPending: Boolean(record.officialDutyPending),
    editedAt: record.editedAt ?? null,
    editReason: record.editReason ?? null,
    clockInMeta: publicMeta(record.clockInMeta),
    clockOutMeta: publicMeta(record.clockOutMeta),
  };
}

/** What the browser is told about where and how a clock event happened. */
function publicMeta(meta) {
  if (!meta) return null;
  return {
    ip: meta.ip ?? null,
    lat: meta.lat ?? null,
    lng: meta.lng ?? null,
    accuracyM: meta.accuracyM ?? null,
    distanceM: meta.distanceM ?? null,
    withinGeofence: meta.withinGeofence ?? null,
    withinIpAllowlist: meta.withinIpAllowlist ?? null,
    reason: meta.reason ?? null,
  };
}

/**
 * Run the office integrity checks for a clock event.
 *
 * Remote staff are exempt but still logged, because "where was this person"
 * is a question the record should be able to answer either way. An office or
 * hybrid employee outside the geofence must give a reason, and the day is
 * routed to approvals as official duty rather than rejected.
 */
function runIntegrityChecks({ office, user, ip, position, reason }) {
  const remote = user.workMode === 'REMOTE';
  const meta = {
    withinIpAllowlist: null,
    withinGeofence: null,
    distanceM: null,
    reason: reason ?? null,
  };

  if (office.enforceIpAllowlist && (office.ipAllowlist ?? []).length) {
    meta.withinIpAllowlist = ipAllowed(ip, office.ipAllowlist);
  }

  if (office.enforceGeofence && Number.isFinite(Number(office.geofence?.lat))) {
    const result = withinGeofence(position, office.geofence, { accuracyM: position?.accuracyM });
    meta.withinGeofence = result.within;
    meta.distanceM = result.distanceM;
  }

  if (remote) return { meta, needsReason: false, officialDutyPending: false };

  const outsideGeofence = meta.withinGeofence === false;
  const outsideNetwork = meta.withinIpAllowlist === false;
  const needsReason = (outsideGeofence || outsideNetwork) && !reason;

  return { meta, needsReason, officialDutyPending: outsideGeofence && Boolean(reason) };
}

/**
 * Clock in. The server stamps the time; a double tap is absorbed by the unique
 * index on (userId, workDate) plus the "clockIn is still null" filter.
 */
export async function clockIn({
  user,
  ip = null,
  userAgent = null,
  position = null,
  reason = null,
  now = new Date(),
}) {
  const ctx = await getWorkspaceContext();
  await connectDB();

  await autoCloseStaleSessions({ userIds: [user.id], now });

  const workDate = workDateFor(ctx, user, now);
  await assertPeriodOpen({ office: user.office, date: workDate, ctx });

  const office = officeFor(ctx, user.office);
  const checks = runIntegrityChecks({ office, user, ip, position, reason });
  if (checks.needsReason) {
    throw new HttpError(
      422,
      "You're outside the office network or location. Add a reason (client visit, official duty) to clock in from here."
    );
  }

  const schedule = scheduleFor(ctx, user, workDate);
  const cycle = cycleFor(ctx, workDate);

  const clockInMeta = {
    ip,
    userAgent: userAgent?.slice(0, 300) ?? null,
    lat: position?.lat ?? null,
    lng: position?.lng ?? null,
    accuracyM: position?.accuracyM ?? null,
    ...checks.meta,
  };

  let record;
  try {
    record = await Attendance.findOneAndUpdate(
      { userId: user.id, workDate, clockIn: null },
      {
        $set: {
          clockIn: now,
          clockInMeta,
          office: user.office,
          cycleKey: cycle.key,
          shiftId: schedule.shiftId || null,
          scheduleSource: schedule.source,
          officialDutyPending: checks.officialDutyPending,
          autoClosed: false,
        },
        $setOnInsert: { userId: user.id, workDate },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (err) {
    // The unique index fired, so a record with a clock-in already exists.
    if (err?.code === 11000) {
      throw new HttpError(409, "You're already clocked in for today.");
    }
    throw err;
  }

  await recomputeDay({ user, workDate, ctx, now });

  if (checks.officialDutyPending) {
    await WorkRequest.create({
      userId: user.id,
      type: 'OFFICIAL_DUTY',
      office: user.office,
      dates: [workDate],
      payload: {
        source: 'CLOCK_IN',
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
        distanceM: checks.meta.distanceM,
      },
      reason,
      status: 'PENDING',
    });
  }

  const fresh = await Attendance.findById(record._id).lean();
  return {
    record: serializeRecord(fresh),
    workDate,
    officialDutyPending: checks.officialDutyPending,
  };
}

/** Start a break. One open break at a time. */
export async function startBreak({ user, type = 'OTHER', now = new Date() }) {
  const ctx = await getWorkspaceContext();
  await connectDB();
  const workDate = workDateFor(ctx, user, now);
  await assertPeriodOpen({ office: user.office, date: workDate, ctx });

  if (!BREAK_TYPES.has(type))
    throw new HttpError(400, 'Pick a break type: lunch, prayer or other.');

  const record = await Attendance.findOne({ userId: user.id, workDate }).lean();
  if (!record?.clockIn) throw new HttpError(409, 'Clock in before starting a break.');
  if (record.clockOut) throw new HttpError(409, "You've already clocked out for today.");
  if ((record.breaks ?? []).some((b) => !b.end)) {
    throw new HttpError(409, "You're already on a break. End it before starting another.");
  }

  // Guarded so two taps cannot open two breaks: the filter only matches while
  // the day is open and no break element is missing its end.
  const started = await Attendance.findOneAndUpdate(
    { _id: record._id, clockOut: null, breaks: { $not: { $elemMatch: { end: null } } } },
    { $push: { breaks: { type, start: now, end: null } } },
    { new: true }
  ).lean();
  if (!started)
    throw new HttpError(409, "You're already on a break. End it before starting another.");

  await recomputeDay({ user, workDate, ctx, now });
  const fresh = await Attendance.findById(record._id).lean();
  return serializeRecord(fresh);
}

/** End the open break. */
export async function endBreak({ user, now = new Date() }) {
  const ctx = await getWorkspaceContext();
  await connectDB();
  const workDate = workDateFor(ctx, user, now);
  await assertPeriodOpen({ office: user.office, date: workDate, ctx });

  const updated = await Attendance.findOneAndUpdate(
    { userId: user.id, workDate, clockOut: null, 'breaks.end': null },
    { $set: { 'breaks.$[open].end': now } },
    { new: true, arrayFilters: [{ 'open.end': null }] }
  ).lean();

  if (!updated) throw new HttpError(409, "You're not on a break right now.");

  await recomputeDay({ user, workDate, ctx, now });
  const fresh = await Attendance.findById(updated._id).lean();
  return serializeRecord(fresh);
}

/**
 * Submit the EOD and clock out, together.
 *
 * These are one action, not two: the clock-out time is stamped at the moment
 * the report is submitted, and a failure anywhere leaves the employee still
 * clocked in with their text intact rather than clocked out with no record of
 * the day. Where the deployment supports transactions this is atomic; where it
 * does not, the EOD is removed again if the clock-out fails.
 */
export async function clockOutWithEod({
  user,
  eod,
  ip = null,
  userAgent = null,
  position = null,
  now = new Date(),
}) {
  const ctx = await getWorkspaceContext();
  await connectDB();

  const workDate = workDateFor(ctx, user, now);
  await assertPeriodOpen({ office: user.office, date: workDate, ctx });

  const record = await Attendance.findOne({ userId: user.id, workDate }).lean();
  if (!record?.clockIn) throw new HttpError(409, 'Clock in before clocking out.');
  if (record.clockOut) throw new HttpError(409, "You've already clocked out for today.");

  const existingEod = await Eod.findOne({ userId: user.id, workDate }).lean();
  if (existingEod) throw new HttpError(409, "Today's EOD has already been submitted.");

  const cycle = cycleFor(ctx, workDate);
  const clockOutMeta = {
    ip,
    userAgent: userAgent?.slice(0, 300) ?? null,
    lat: position?.lat ?? null,
    lng: position?.lng ?? null,
    accuracyM: position?.accuracyM ?? null,
  };

  const result = await withTransaction(async (session) => {
    const [created] = await Eod.create(
      [
        {
          userId: user.id,
          attendanceId: record._id,
          workDate,
          cycleKey: cycle.key,
          office: user.office,
          tasks: eod.tasks,
          blockers: eod.blockers ?? null,
          tomorrowPlan: eod.tomorrowPlan ?? null,
          links: eod.links ?? [],
          attachments: eod.attachments ?? [],
          submittedAt: now,
          lateSubmission: false,
        },
      ],
      withSession(session)
    );

    try {
      const updated = await Attendance.findOneAndUpdate(
        { _id: record._id, clockOut: null },
        {
          $set: {
            clockOut: now,
            clockOutMeta,
            eodId: created._id,
            eodMissing: false,
            // Any break still running ends with the day.
            breaks: (record.breaks ?? []).map((b) => (b.end ? b : { ...b, end: now })),
          },
        },
        { new: true, ...withSession(session) }
      ).lean();

      if (!updated) throw new HttpError(409, "You've already clocked out for today.");
      return { attendance: updated, eod: created };
    } catch (err) {
      // Fallback mode has no rollback, so undo the EOD by hand.
      if (!session) await Eod.deleteOne({ _id: created._id }).catch(() => {});
      throw err;
    }
  });

  await recomputeDay({ user, workDate, ctx, now });
  const fresh = await Attendance.findById(result.attendance._id).lean();
  return { record: serializeRecord(fresh), eodId: String(result.eod._id), workDate };
}

/**
 * Build a day-by-day view for one user over a date range. Used by the employee
 * attendance history, the drill-down page and every report.
 */
export async function buildDayRange({ user, fromDate, toDate, ctx, now = new Date() }) {
  const context = ctx ?? (await getWorkspaceContext());
  await connectDB();

  const start = DateTime.fromISO(fromDate, { zone: TIMEZONE }).startOf('day');
  const end = DateTime.fromISO(toDate, { zone: TIMEZONE }).startOf('day');
  if (!start.isValid || !end.isValid || end < start) return [];

  const dates = [];
  for (let cursor = start; cursor <= end && dates.length < 400; cursor = cursor.plus({ days: 1 })) {
    dates.push(cursor.toISODate());
  }

  const userId = user.id ?? user._id;
  const [records, eods, { leavesByDate, flagsByDate }] = await Promise.all([
    Attendance.find({ userId, workDate: { $in: dates } }).lean(),
    Eod.find({ userId, workDate: { $in: dates } })
      .select('workDate tasks submittedAt lateSubmission')
      .lean(),
    loadDayContext(userId, dates),
  ]);

  const recordsByDate = new Map(records.map((r) => [r.workDate, r]));
  const eodsByDate = new Map(eods.map((e) => [e.workDate, e]));

  return dates.map((workDate) => {
    const record = recordsByDate.get(workDate) ?? null;
    const { schedule, computed } = evaluateDay({
      ctx: context,
      user,
      workDate,
      record,
      leave: leavesByDate.get(workDate),
      flags: flagsByDate.get(workDate),
      now,
    });
    const eod = eodsByDate.get(workDate) ?? null;
    return {
      workDate,
      schedule: {
        working: schedule.working,
        start: schedule.start,
        end: schedule.end,
        requiredMinutes: schedule.requiredMinutes,
        shiftName: schedule.shiftName,
        overrideName: schedule.overrideName,
        flexible: schedule.flexible,
      },
      // Stored values win for a finished day; the live computation fills in
      // anything the record has not caught up with yet.
      status:
        record?.status && record.status !== STATUS.NOT_MARKED ? record.status : computed.status,
      computed,
      record: serializeRecord(record),
      eod: eod
        ? {
            id: String(eod._id),
            taskCount: eod.tasks?.length ?? 0,
            submittedAt: eod.submittedAt,
            lateSubmission: eod.lateSubmission,
          }
        : null,
      eodSubmitted: Boolean(eod),
    };
  });
}

/** Live worked minutes for an open session, for the dashboard timer. */
export function liveMinutes(record, { tz, paidBreaks = false, now = new Date() }) {
  return {
    worked: computeWorkedMinutes(record, { now, tz, paidBreaks }),
    onBreak: computeBreakMinutes(record?.breaks, now, tz),
  };
}
