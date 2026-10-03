import 'server-only';
import { DateTime } from 'luxon';
import User from '../../../models/workspace/User.js';
import Attendance from '../../../models/workspace/Attendance.js';
import Eod from '../../../models/workspace/Eod.js';
import LeaveRequest from '../../../models/workspace/LeaveRequest.js';
import WorkRequest from '../../../models/workspace/WorkRequest.js';
import { connectDB } from '../db.js';
import { getWorkspaceContext, scheduleFor } from '../context.js';
import { computeDayStatus, STATUS, computeBreakMinutes } from '../calc/attendance.js';
import { TIMEZONE, todayInPakistan } from '../timezone.js';
import { serializeRecord } from './attendance.js';

/**
 * The leadership day view: one row per employee for one date.
 *
 * The live board and the team attendance sheet are the same query with a
 * different presentation, so they share this builder. Everything is in
 * Pakistan time, so every row's clock-in reads on the same clock.
 */

/** Who is on the board today, after the office and department filters. */
async function selectPeople({ office, departmentId, includeExempt = false }) {
  const query = { status: 'ACTIVE' };
  if (!includeExempt) query.requiresAttendance = true;
  if (office) query.office = office;
  if (departmentId) query.departmentId = departmentId;
  await connectDB();
  return User.find(query).sort({ name: 1 }).lean();
}

/**
 * Build the rows for one date.
 *
 * @param {object} args
 * @param {string} [args.date] - 'YYYY-MM-DD'. Defaults to today in Pakistan.
 * @param {object} [args.filters] - { office, departmentId, status }
 * @param {boolean} [args.live] - true for the board (adds on-break state)
 */
export async function buildTeamDay({
  date = null,
  filters = {},
  live = false,
  now = new Date(),
} = {}) {
  const ctx = await getWorkspaceContext();
  const workDate = date ?? todayInPakistan(now);
  const people = await selectPeople(filters);
  if (!people.length) return { date: workDate, rows: [], counts: emptyCounts() };

  const dates = [workDate];
  const ids = people.map((p) => p._id);

  const [records, eods, leaves, workRequests] = await Promise.all([
    Attendance.find({ userId: { $in: ids }, workDate: { $in: dates } }).lean(),
    Eod.find({ userId: { $in: ids }, workDate: { $in: dates } })
      .select('userId workDate tasks submittedAt')
      .lean(),
    LeaveRequest.find({
      userId: { $in: ids },
      status: { $in: ['APPROVED', 'PARTIALLY_APPROVED'] },
      approvedDates: { $in: dates },
    }).lean(),
    WorkRequest.find({
      userId: { $in: ids },
      type: { $in: ['WFH', 'OFFICIAL_DUTY'] },
      status: 'APPROVED',
      dates: { $in: dates },
    }).lean(),
  ]);

  const keyOf = (userId, workDate) => String(userId) + '|' + workDate;
  const recordBy = new Map(records.map((r) => [keyOf(r.userId, r.workDate), r]));
  const eodBy = new Map(eods.map((e) => [keyOf(e.userId, e.workDate), e]));

  const leaveBy = new Map();
  for (const leave of leaves) {
    for (const d of leave.approvedDates ?? []) {
      if (!dates.includes(d)) continue;
      leaveBy.set(keyOf(leave.userId, d), {
        from: d,
        to: d,
        halfDay: leave.halfDay,
        hours: leave.hours,
        status: 'APPROVED',
      });
    }
  }

  const flagBy = new Map();
  for (const request of workRequests) {
    for (const d of request.dates ?? []) {
      if (!dates.includes(d)) continue;
      const k = keyOf(request.userId, d);
      const entry = flagBy.get(k) ?? { wfh: false, officialDuty: false };
      if (request.type === 'WFH') entry.wfh = true;
      if (request.type === 'OFFICIAL_DUTY') entry.officialDuty = true;
      flagBy.set(k, entry);
    }
  }

  const rows = [];
  for (const raw of people) {
    const user = { ...raw, id: String(raw._id) };
    const key = keyOf(user.id, workDate);
    const record = recordBy.get(key) ?? null;

    const schedule = scheduleFor(ctx, user, workDate);
    const computed = computeDayStatus(
      schedule,
      record,
      leaveBy.has(key) ? [leaveBy.get(key)] : [],
      ctx.holidays,
      {
        rules: ctx.rules,
        office: user.office,
        now,
        requiresAttendance: user.requiresAttendance !== false,
        wfh: flagBy.get(key)?.wfh,
        officialDuty: flagBy.get(key)?.officialDuty,
      }
    );

    const openBreak = (record?.breaks ?? []).find((b) => !b.end) ?? null;
    const eod = eodBy.get(key) ?? null;

    rows.push({
      userId: user.id,
      employeeId: user.employeeId,
      name: user.name,
      designation: user.designation ?? null,
      department: user.department ?? null,
      office: user.office,
      workMode: user.workMode,
      workDate,
      shift: schedule.working
        ? {
            start: schedule.start,
            end: schedule.end,
            name: schedule.shiftName,
            requiredMinutes: schedule.requiredMinutes,
          }
        : null,
      clockIn: record?.clockIn ?? null,
      clockOut: record?.clockOut ?? null,
      localClockIn: localTime(record?.clockIn),
      localClockOut: localTime(record?.clockOut),
      status:
        record?.status && record.status !== STATUS.NOT_MARKED ? record.status : computed.status,
      liveStatus: liveStatusFor({ record, openBreak, computed }),
      flags: computed.flags,
      workedMinutes: computed.workedMinutes,
      requiredMinutes: computed.requiredMinutes,
      breakMinutes: computed.breakMinutes,
      lateByMinutes: computed.lateByMinutes,
      earlyByMinutes: computed.earlyByMinutes,
      overtimeMinutes: computed.overtimeMinutes,
      overtimeApproved: Boolean(record?.overtimeApproved),
      onBreak: Boolean(openBreak),
      breakSince: openBreak?.start ?? null,
      breakType: openBreak?.type ?? null,
      autoClosed: Boolean(record?.autoClosed),
      officialDutyPending: Boolean(record?.officialDutyPending),
      eodSubmitted: Boolean(eod),
      eodTaskCount: eod?.tasks?.length ?? 0,
      edited: Boolean(record?.editedAt),
      ...(live ? {} : { record: serializeRecord(record) }),
    });
  }

  const filtered = filters.status ? rows.filter((r) => r.status === filters.status) : rows;
  return { date: workDate, rows: filtered, counts: countsFor(rows) };
}

/** What someone is doing right now, which is not always their day's status. */
function liveStatusFor({ record, openBreak, computed }) {
  if (openBreak) return 'ON_BREAK';
  if (record?.clockIn && !record?.clockOut) return computed.lateByMinutes > 0 ? 'IN_LATE' : 'IN';
  if (record?.clockOut) return 'OUT';
  if (
    [STATUS.ON_LEAVE, STATUS.WFH, STATUS.OFFICIAL_DUTY, STATUS.HOLIDAY, STATUS.WEEKEND].includes(
      computed.status
    )
  ) {
    return computed.status;
  }
  return 'NOT_IN';
}

function emptyCounts() {
  return {
    total: 0,
    in: 0,
    onBreak: 0,
    late: 0,
    notIn: 0,
    out: 0,
    onLeave: 0,
    wfh: 0,
    officialDuty: 0,
    off: 0,
  };
}

function countsFor(rows) {
  const counts = emptyCounts();
  counts.total = rows.length;
  for (const row of rows) {
    switch (row.liveStatus) {
      case 'ON_BREAK':
        counts.onBreak += 1;
        counts.in += 1;
        break;
      case 'IN':
        counts.in += 1;
        break;
      case 'IN_LATE':
        counts.in += 1;
        counts.late += 1;
        break;
      case 'OUT':
        counts.out += 1;
        break;
      case STATUS.ON_LEAVE:
        counts.onLeave += 1;
        break;
      case STATUS.WFH:
        counts.wfh += 1;
        break;
      case STATUS.OFFICIAL_DUTY:
        counts.officialDuty += 1;
        break;
      case STATUS.HOLIDAY:
      case STATUS.WEEKEND:
        counts.off += 1;
        break;
      default:
        counts.notIn += 1;
    }
    // A late arrival counts as late for the day even after clocking out.
    if (row.liveStatus === 'OUT' && row.lateByMinutes > 0) counts.late += 1;
  }
  return counts;
}

/** 'HH:mm' in Pakistan time. */
function localTime(instant) {
  if (!instant) return null;
  return DateTime.fromJSDate(new Date(instant), { zone: TIMEZONE }).toFormat('HH:mm');
}

export { computeBreakMinutes };
