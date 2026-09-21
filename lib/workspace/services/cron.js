import 'server-only';
import { DateTime } from 'luxon';
import User from '../../../models/workspace/User.js';
import Attendance from '../../../models/workspace/Attendance.js';
import { connectDB } from '../db.js';
import {
  getWorkspaceContext,
  scheduleFor,
  cycleFor,
  timezoneFor,
  isPeriodLocked,
} from '../context.js';
import { STATUS, findHoliday } from '../calc/attendance.js';
import { recomputeDay } from './attendance.js';
import { notify, notifyMany } from './notifications.js';
import { missingEodsFor } from './eod.js';
import { buildTeamDay } from './team.js';
import LeaveRequest from '../../../models/workspace/LeaveRequest.js';

/**
 * The scheduled jobs.
 *
 * Every one of them is idempotent and safe to re-run, because Vercel's Hobby
 * plan only allows a daily cron and a late or repeated run must not double up.
 * Anything time-sensitive is also checked lazily on page load (see
 * autoCloseStaleSessions), so correctness never depends on a cron firing at a
 * particular minute.
 */

/** Anyone whose attendance is tracked and who is still employed. */
async function trackedUsers(office = null) {
  await connectDB();
  const query = { status: 'ACTIVE', requiresAttendance: true };
  if (office) query.office = office;
  const users = await User.find(query).lean();
  return users.map((u) => ({ ...u, id: String(u._id) }));
}

/**
 * Mark yesterday's absences, each office in its own timezone.
 *
 * Only a working day with no clock-in, no approved leave and no holiday counts.
 * Days inside a locked period are left alone.
 */
export async function markAbsences({ now = new Date() } = {}) {
  const ctx = await getWorkspaceContext();
  const users = await trackedUsers();
  let marked = 0;
  let skipped = 0;

  for (const user of users) {
    const tz = timezoneFor(ctx, user);
    const workDate = DateTime.fromJSDate(now, { zone: tz }).minus({ days: 1 }).toISODate();

    const schedule = scheduleFor(ctx, user, workDate);
    if (!schedule.working) continue;
    if (findHoliday(ctx.holidays, workDate, user.office)) continue;

    const onLeave = await LeaveRequest.exists({
      userId: user.id,
      status: { $in: ['APPROVED', 'PARTIALLY_APPROVED'] },
      approvedDates: workDate,
    });
    if (onLeave) continue;

    const existing = await Attendance.findOne({ userId: user.id, workDate }).lean();
    if (existing?.clockIn) continue;
    if (existing && existing.status !== STATUS.NOT_MARKED) {
      skipped += 1;
      continue;
    }

    if (await isPeriodLocked({ office: user.office, date: workDate, ctx })) {
      skipped += 1;
      continue;
    }

    const cycle = cycleFor(ctx, user, workDate);
    await Attendance.updateOne(
      { userId: user.id, workDate },
      {
        $set: {
          office: user.office,
          timezone: tz,
          cycleKey: cycle.key,
          requiredMinutes: schedule.requiredMinutes,
          shiftId: schedule.shiftId || null,
          status: STATUS.ABSENT,
        },
        $setOnInsert: { userId: user.id, workDate },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    await recomputeDay({ user, workDate, ctx, now }).catch(() => null);
    marked += 1;
  }

  return { marked, skipped, considered: users.length };
}

/**
 * Remind anyone who has not clocked in a quarter of an hour after their shift
 * started. Skips non-working days, holidays and approved leave, so the only
 * people who hear from it are people who should be at work.
 */
export async function sendClockInReminders({ now = new Date(), afterMinutes = 15 } = {}) {
  const ctx = await getWorkspaceContext();
  if (ctx.settings?.notifications?.clockInReminder === false)
    return { sent: 0, reason: 'disabled' };

  const users = await trackedUsers();
  let sent = 0;

  for (const user of users) {
    const tz = timezoneFor(ctx, user);
    const workDate = DateTime.fromJSDate(now, { zone: tz }).toISODate();
    const schedule = scheduleFor(ctx, user, workDate);
    if (!schedule.working || !schedule.startAt) continue;
    if (findHoliday(ctx.holidays, workDate, user.office)) continue;

    const due = DateTime.fromJSDate(schedule.startAt, { zone: tz }).plus({ minutes: afterMinutes });
    const nowTz = DateTime.fromJSDate(now, { zone: tz });
    // Only inside the hour after it became due, so a daily cron does not
    // send a pointless reminder at midnight.
    if (nowTz < due || nowTz > due.plus({ hours: 1 })) continue;

    const record = await Attendance.findOne({ userId: user.id, workDate }).lean();
    if (record?.clockIn) continue;

    const onLeave = await LeaveRequest.exists({
      userId: user.id,
      status: { $in: ['APPROVED', 'PARTIALLY_APPROVED'] },
      approvedDates: workDate,
    });
    if (onLeave) continue;

    const created = await notify({
      userId: user.id,
      type: 'CLOCK_IN_REMINDER',
      title: 'You have not clocked in yet',
      message: 'Your shift started at ' + schedule.start + '. Clock in when you can.',
      link: '/workspace',
      dedupeKey: 'clockin:' + user.id + ':' + workDate,
      settings: ctx.settings,
    });
    if (created) sent += 1;
  }

  return { sent };
}

/** Remind anyone still clocked in once their shift has ended. */
export async function sendClockOutReminders({ now = new Date() } = {}) {
  const ctx = await getWorkspaceContext();
  if (ctx.settings?.notifications?.clockOutReminder === false)
    return { sent: 0, reason: 'disabled' };

  await connectDB();
  const open = await Attendance.find({ clockIn: { $ne: null }, clockOut: null })
    .limit(500)
    .lean();
  if (!open.length) return { sent: 0 };

  const users = await User.find({ _id: { $in: open.map((r) => r.userId) } }).lean();
  const byId = new Map(users.map((u) => [String(u._id), { ...u, id: String(u._id) }]));

  let sent = 0;
  for (const record of open) {
    const user = byId.get(String(record.userId));
    if (!user) continue;
    const schedule = scheduleFor(ctx, user, record.workDate);
    if (!schedule.endAt) continue;
    if (now < schedule.endAt) continue;

    const created = await notify({
      userId: user.id,
      type: 'CLOCK_OUT_REMINDER',
      title: 'Your shift has ended',
      message: 'Submit your EOD and clock out for ' + record.workDate + '.',
      link: '/workspace',
      dedupeKey: 'clockout:' + user.id + ':' + record.workDate,
      settings: ctx.settings,
    });
    if (created) sent += 1;
  }

  return { sent };
}

/** The morning summary of yesterday, for everyone who oversees attendance. */
export async function sendDailySummary({ now = new Date() } = {}) {
  const ctx = await getWorkspaceContext();
  if (ctx.settings?.notifications?.leadershipDailySummary === false) {
    return { sent: 0, reason: 'disabled' };
  }

  await connectDB();
  const leaders = await User.find({ status: 'ACTIVE', role: { $in: ['OWNER', 'CEO', 'MD'] } })
    .select('_id timezone office')
    .lean();
  if (!leaders.length) return { sent: 0 };

  const tz = timezoneFor(ctx, { office: 'ISLAMABAD' });
  const yesterday = DateTime.fromJSDate(now, { zone: tz }).minus({ days: 1 }).toISODate();

  const { counts } = await buildTeamDay({ date: yesterday, now });
  const missing = await missingEodsFor({ workDate: yesterday, ctx });

  const message =
    counts.in +
    ' in, ' +
    counts.late +
    ' late, ' +
    counts.notIn +
    ' absent, ' +
    counts.onLeave +
    ' on leave, ' +
    missing.length +
    ' missing EODs.';

  const sent = await notifyMany(
    leaders.map((l) => String(l._id)),
    {
      type: 'DAILY_SUMMARY',
      title: 'Attendance summary for ' + yesterday,
      message,
      link: '/workspace/team?date=' + yesterday,
      dedupeKey: 'summary:' + yesterday,
      settings: ctx.settings,
    }
  );

  return { sent: sent.length, date: yesterday, counts, missingEods: missing.length };
}

/** Tell the Owner a week before someone's probation ends. */
export async function sendProbationAlerts({ now = new Date(), daysAhead = 7 } = {}) {
  const ctx = await getWorkspaceContext();
  if (ctx.settings?.notifications?.probationEndingAlert === false) {
    return { sent: 0, reason: 'disabled' };
  }

  await connectDB();
  const owners = await User.find({ status: 'ACTIVE', role: 'OWNER' }).select('_id').lean();
  if (!owners.length) return { sent: 0 };

  const target = DateTime.fromJSDate(now, { zone: 'Asia/Karachi' }).plus({ days: daysAhead });
  const due = await User.find({
    status: 'ACTIVE',
    employmentType: 'PROBATION',
    probationEnd: { $gte: target.startOf('day').toJSDate(), $lte: target.endOf('day').toJSDate() },
  })
    .select('name employeeId probationEnd')
    .lean();

  let sent = 0;
  for (const person of due) {
    const on = DateTime.fromJSDate(person.probationEnd, { zone: 'Asia/Karachi' }).toISODate();
    const created = await notifyMany(
      owners.map((o) => String(o._id)),
      {
        type: 'PROBATION_ENDING',
        title: 'Probation ending for ' + person.name,
        message: person.employeeId + ' finishes probation on ' + on + '. Confirm or extend.',
        link: '/workspace/employees/' + String(person._id),
        dedupeKey: 'probation:' + String(person._id) + ':' + on,
        settings: ctx.settings,
      }
    );
    sent += created.length;
  }

  return { sent, due: due.length };
}
