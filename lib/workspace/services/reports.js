import 'server-only';
import { DateTime } from 'luxon';
import User from '../../../models/workspace/User.js';
import Attendance from '../../../models/workspace/Attendance.js';
import Eod from '../../../models/workspace/Eod.js';
import LeaveRequest from '../../../models/workspace/LeaveRequest.js';
import LeaveBalance from '../../../models/workspace/LeaveBalance.js';
import LeaveType from '../../../models/workspace/LeaveType.js';
import { connectDB } from '../db.js';
import { getWorkspaceContext, cycleFor, timezoneFor } from '../context.js';
import { buildDayRange } from './attendance.js';
import { missingEodsFor } from './eod.js';
import { STATUS, STATUS_LABELS, formatDuration, lateDeductionDays } from '../calc/attendance.js';
import { remainingPaidLeave } from '../calc/leave.js';
import { HttpError } from '../auth.js';

/**
 * Reports, and the payroll summary they feed.
 *
 * Every report is built as `{ title, columns, rows }`, so one export route can
 * turn any of them into .xlsx or .csv without knowing what it is looking at.
 * Columns carry a type so numbers export as numbers rather than as text that
 * happens to look numeric in a spreadsheet.
 */

export const REPORTS = Object.freeze({
  REGISTER: 'register',
  LATE: 'late',
  ABSENTEES: 'absentees',
  LEAVE_BALANCES: 'leave-balances',
  LEAVE_HISTORY: 'leave-history',
  OVERTIME: 'overtime',
  DEPARTMENT: 'department',
  EMPLOYEE: 'employee',
  WORK_LOG: 'work-log',
  MISSING_EODS: 'missing-eods',
  PAYROLL: 'payroll',
});

export const REPORT_LABELS = Object.freeze({
  register: 'Monthly attendance register',
  late: 'Late arrivals',
  absentees: 'Absentees',
  'leave-balances': 'Leave balances',
  'leave-history': 'Leave history',
  overtime: 'Overtime',
  department: 'Department summary',
  employee: 'Individual employee report',
  'work-log': 'EOD work log by client or project',
  'missing-eods': 'Missing EODs',
  payroll: 'Payroll summary',
});

const text = (key, label) => ({ key, label, type: 'text' });
const num = (key, label) => ({ key, label, type: 'number' });

/** Everyone the report covers, after the office and department filters. */
async function selectUsers({ office, departmentId, userId, includeExempt = false }) {
  const query = {};
  if (!includeExempt) query.requiresAttendance = true;
  if (office) query.office = office;
  if (departmentId) query.departmentId = departmentId;
  if (userId) query._id = userId;
  await connectDB();
  return User.find(query).sort({ name: 1 }).lean();
}

/** Resolve the date window: an explicit range, or a cycle for one office. */
export async function resolveWindow({ ctx, from, to, cycleKey, office }) {
  if (from && to) return { from, to, label: from + ' to ' + to, cycleKey: null };

  const tz = office ? timezoneFor(ctx, { office }) : 'Asia/Karachi';
  const anchor = cycleKey
    ? DateTime.fromISO(cycleKey + '-15', { zone: tz }).toJSDate()
    : new Date();
  const cycle = cycleFor(ctx, { office, timezone: tz }, anchor);
  return { from: cycle.startDate, to: cycle.endDate, label: cycle.label, cycleKey: cycle.key };
}

/** Per-user totals over a window. The shared spine of most reports. */
async function summarise({ ctx, users, from, to, now = new Date() }) {
  const out = [];
  for (const raw of users) {
    const user = { ...raw, id: String(raw._id) };
    const days = await buildDayRange({ user, fromDate: from, toDate: to, ctx, now });

    const totals = {
      user,
      workingDays: 0,
      present: 0,
      late: 0,
      lateMinutes: 0,
      earlyLeave: 0,
      halfDays: 0,
      absent: 0,
      onLeave: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      holidays: 0,
      weekends: 0,
      wfh: 0,
      officialDuty: 0,
      workedMinutes: 0,
      requiredMinutes: 0,
      overtimeMinutes: 0,
      approvedOvertime: { WEEKDAY: 0, WEEKEND: 0, HOLIDAY: 0 },
      missingClockOut: 0,
      eodsSubmitted: 0,
      days,
    };

    for (const day of days) {
      const status = day.status;
      if (day.computed.isWorkingDay) totals.workingDays += 1;
      if (status === STATUS.WEEKEND) totals.weekends += 1;
      if (status === STATUS.HOLIDAY) totals.holidays += 1;
      if (status === STATUS.ABSENT) totals.absent += 1;
      if (status === STATUS.ON_LEAVE) totals.onLeave += 1;
      if (status === STATUS.WFH) totals.wfh += 1;
      if (status === STATUS.OFFICIAL_DUTY) totals.officialDuty += 1;
      if (status === STATUS.HALF_DAY) totals.halfDays += 1;
      if (status === STATUS.MISSING_CLOCK_OUT) totals.missingClockOut += 1;
      if (day.computed.countsAsPresent) totals.present += 1;
      // Lateness is counted from the minutes, so a day that was late and also
      // short still counts as a late arrival.
      if (day.computed.lateByMinutes > 0) {
        totals.late += 1;
        totals.lateMinutes += day.computed.lateByMinutes;
      }
      if (day.computed.earlyByMinutes > 0) totals.earlyLeave += 1;
      totals.workedMinutes += day.computed.workedMinutes;
      totals.requiredMinutes += day.computed.requiredMinutes;
      totals.overtimeMinutes += day.computed.overtimeMinutes;
      if (day.record?.overtimeApproved) {
        const category = day.record.overtimeCategory ?? 'WEEKDAY';
        totals.approvedOvertime[category] += day.record.overtimeApprovedMinutes ?? 0;
      }
      if (day.eodSubmitted) totals.eodsSubmitted += 1;
    }

    const leaves = await LeaveRequest.find({
      userId: user.id,
      status: { $in: ['APPROVED', 'PARTIALLY_APPROVED'] },
      approvedDates: { $gte: from, $lte: to },
    }).lean();
    for (const leave of leaves) {
      const inWindow = (leave.approvedDates ?? []).filter((d) => d >= from && d <= to).length;
      const share = leave.approvedDates?.length ? inWindow / leave.approvedDates.length : 0;
      totals.paidLeaveDays += Math.round((leave.paidDays ?? 0) * share * 2) / 2;
      totals.unpaidLeaveDays += Math.round((leave.unpaidDays ?? 0) * share * 2) / 2;
    }

    totals.lateDeductionDays = lateDeductionDays(totals.late, ctx.rules);
    totals.attendanceRate = totals.workingDays
      ? Math.round((totals.present / totals.workingDays) * 1000) / 10
      : 0;
    out.push(totals);
  }
  return out;
}

/**
 * Build a report.
 *
 * @param {object} args
 * @param {string} args.key - one of REPORTS
 * @param {object} args.filters - { from, to, cycleKey, office, departmentId, userId, projectId, status }
 * @returns {Promise<{title:string,subtitle:string,columns:Array,rows:Array}>}
 */
export async function buildReport({ key, filters = {}, now = new Date() }) {
  const ctx = await getWorkspaceContext();
  const window = await resolveWindow({ ctx, ...filters });
  const { from, to } = window;

  const base = { subtitle: window.label, window };

  switch (key) {
    case REPORTS.REGISTER: {
      const users = await selectUsers(filters);
      const summaries = await summarise({ ctx, users, from, to, now });
      // One column per date, so the sheet reads like a paper muster roll.
      const dates = summaries[0]?.days.map((d) => d.workDate) ?? [];
      return {
        ...base,
        title: REPORT_LABELS.register,
        columns: [
          text('employeeId', 'Employee ID'),
          text('name', 'Name'),
          text('department', 'Department'),
          text('office', 'Office'),
          ...dates.map((d) => text('d_' + d, d.slice(8) + '/' + d.slice(5, 7))),
          num('present', 'Present'),
          num('absent', 'Absent'),
          num('late', 'Late'),
          num('onLeave', 'On leave'),
        ],
        rows: summaries.map((s) => ({
          employeeId: s.user.employeeId,
          name: s.user.name,
          department: s.user.department ?? '',
          office: s.user.office,
          ...Object.fromEntries(s.days.map((d) => ['d_' + d.workDate, shortCode(d.status)])),
          present: s.present,
          absent: s.absent,
          late: s.late,
          onLeave: s.onLeave,
        })),
      };
    }

    case REPORTS.LATE: {
      const users = await selectUsers(filters);
      const summaries = await summarise({ ctx, users, from, to, now });
      const rows = [];
      for (const s of summaries) {
        for (const day of s.days) {
          if (day.computed.lateByMinutes <= 0) continue;
          rows.push({
            date: day.workDate,
            employeeId: s.user.employeeId,
            name: s.user.name,
            department: s.user.department ?? '',
            office: s.user.office,
            shiftStart: day.schedule.start ?? '',
            clockIn: localTime(day.record?.clockIn, timezoneFor(ctx, s.user)),
            lateByMinutes: day.computed.lateByMinutes,
            status: STATUS_LABELS[day.status] ?? day.status,
          });
        }
      }
      rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
      return {
        ...base,
        title: REPORT_LABELS.late,
        columns: [
          text('date', 'Date'),
          text('employeeId', 'Employee ID'),
          text('name', 'Name'),
          text('department', 'Department'),
          text('office', 'Office'),
          text('shiftStart', 'Shift start'),
          text('clockIn', 'Clocked in'),
          num('lateByMinutes', 'Late by (min)'),
          text('status', 'Status'),
        ],
        rows,
      };
    }

    case REPORTS.ABSENTEES: {
      const users = await selectUsers(filters);
      const summaries = await summarise({ ctx, users, from, to, now });
      const rows = [];
      for (const s of summaries) {
        for (const day of s.days) {
          if (day.status !== STATUS.ABSENT) continue;
          rows.push({
            date: day.workDate,
            employeeId: s.user.employeeId,
            name: s.user.name,
            department: s.user.department ?? '',
            office: s.user.office,
            requiredMinutes: day.schedule.requiredMinutes,
          });
        }
      }
      rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
      return {
        ...base,
        title: REPORT_LABELS.absentees,
        columns: [
          text('date', 'Date'),
          text('employeeId', 'Employee ID'),
          text('name', 'Name'),
          text('department', 'Department'),
          text('office', 'Office'),
          num('requiredMinutes', 'Required (min)'),
        ],
        rows,
      };
    }

    case REPORTS.LEAVE_BALANCES: {
      const users = await selectUsers(filters);
      await connectDB();
      const rows = [];
      for (const raw of users) {
        const user = { ...raw, id: String(raw._id) };
        const cycle = cycleFor(
          ctx,
          user,
          window.cycleKey ? DateTime.fromISO(to).toJSDate() : new Date()
        );
        const balance = (await LeaveBalance.findOne({
          userId: user.id,
          cycleKey: cycle.key,
        }).lean()) ?? {
          quota: ctx.leaveSettings.monthlyLeaveQuota,
          carriedIn: 0,
          used: 0,
          pending: 0,
        };
        rows.push({
          employeeId: user.employeeId,
          name: user.name,
          department: user.department ?? '',
          office: user.office,
          cycle: cycle.label,
          quota: balance.quota ?? 0,
          carriedIn: balance.carriedIn ?? 0,
          used: balance.used ?? 0,
          pending: balance.pending ?? 0,
          remaining: remainingPaidLeave(balance, ctx.leaveSettings),
        });
      }
      return {
        ...base,
        title: REPORT_LABELS['leave-balances'],
        columns: [
          text('employeeId', 'Employee ID'),
          text('name', 'Name'),
          text('department', 'Department'),
          text('office', 'Office'),
          text('cycle', 'Cycle'),
          num('quota', 'Quota'),
          num('carriedIn', 'Carried in'),
          num('used', 'Used'),
          num('pending', 'Pending'),
          num('remaining', 'Remaining'),
        ],
        rows,
      };
    }

    case REPORTS.LEAVE_HISTORY: {
      const users = await selectUsers({ ...filters, includeExempt: true });
      const ids = users.map((u) => u._id);
      await connectDB();
      const [requests, types] = await Promise.all([
        LeaveRequest.find({ userId: { $in: ids }, from: { $lte: to }, to: { $gte: from } })
          .sort({ from: -1 })
          .lean(),
        LeaveType.find({}).lean(),
      ]);
      const typeById = new Map(types.map((t) => [String(t._id), t]));
      const userById = new Map(users.map((u) => [String(u._id), u]));
      return {
        ...base,
        title: REPORT_LABELS['leave-history'],
        columns: [
          text('employeeId', 'Employee ID'),
          text('name', 'Name'),
          text('type', 'Leave type'),
          text('from', 'From'),
          text('to', 'To'),
          num('days', 'Days'),
          num('paidDays', 'Paid'),
          num('unpaidDays', 'Unpaid'),
          text('status', 'Status'),
          text('reason', 'Reason'),
          text('reviewComment', 'Reviewer comment'),
        ],
        rows: requests.map((r) => {
          const user = userById.get(String(r.userId));
          return {
            employeeId: user?.employeeId ?? '',
            name: user?.name ?? '',
            type: typeById.get(String(r.leaveTypeId))?.name ?? '',
            from: r.from,
            to: r.to,
            days: r.days,
            paidDays: r.paidDays,
            unpaidDays: r.unpaidDays,
            status: r.status,
            reason: r.reason,
            reviewComment: r.reviewComment ?? '',
          };
        }),
      };
    }

    case REPORTS.OVERTIME: {
      const users = await selectUsers(filters);
      const summaries = await summarise({ ctx, users, from, to, now });
      const rows = [];
      for (const s of summaries) {
        for (const day of s.days) {
          if (!day.computed.overtimeMinutes) continue;
          rows.push({
            date: day.workDate,
            employeeId: s.user.employeeId,
            name: s.user.name,
            office: s.user.office,
            category: day.record?.overtimeCategory ?? 'WEEKDAY',
            overtimeMinutes: day.computed.overtimeMinutes,
            approved: day.record?.overtimeApproved ? 'Yes' : 'No',
            approvedMinutes: day.record?.overtimeApprovedMinutes ?? 0,
          });
        }
      }
      rows.sort((a, b) => a.date.localeCompare(b.date));
      return {
        ...base,
        title: REPORT_LABELS.overtime,
        columns: [
          text('date', 'Date'),
          text('employeeId', 'Employee ID'),
          text('name', 'Name'),
          text('office', 'Office'),
          text('category', 'Category'),
          num('overtimeMinutes', 'Overtime (min)'),
          text('approved', 'Approved'),
          num('approvedMinutes', 'Approved (min)'),
        ],
        rows,
      };
    }

    case REPORTS.DEPARTMENT: {
      const users = await selectUsers(filters);
      const summaries = await summarise({ ctx, users, from, to, now });
      const byDept = new Map();
      for (const s of summaries) {
        const key = s.user.department || 'Unassigned';
        const row = byDept.get(key) ?? {
          department: key,
          headcount: 0,
          workingDays: 0,
          present: 0,
          absent: 0,
          late: 0,
          onLeave: 0,
          workedMinutes: 0,
        };
        row.headcount += 1;
        row.workingDays += s.workingDays;
        row.present += s.present;
        row.absent += s.absent;
        row.late += s.late;
        row.onLeave += s.onLeave;
        row.workedMinutes += s.workedMinutes;
        byDept.set(key, row);
      }
      return {
        ...base,
        title: REPORT_LABELS.department,
        columns: [
          text('department', 'Department'),
          num('headcount', 'People'),
          num('workingDays', 'Working days'),
          num('present', 'Present'),
          num('absent', 'Absent'),
          num('late', 'Late'),
          num('onLeave', 'On leave'),
          num('attendanceRate', 'Attendance %'),
          text('hours', 'Hours worked'),
        ],
        rows: [...byDept.values()].map((r) => ({
          ...r,
          attendanceRate: r.workingDays ? Math.round((r.present / r.workingDays) * 1000) / 10 : 0,
          hours: formatDuration(r.workedMinutes),
        })),
      };
    }

    case REPORTS.EMPLOYEE: {
      if (!filters.userId) throw new HttpError(400, 'Pick an employee for this report.');
      const users = await selectUsers({ ...filters, includeExempt: true });
      const summaries = await summarise({ ctx, users, from, to, now });
      const s = summaries[0];
      if (!s) throw new HttpError(404, 'That employee no longer has an account.');
      const tz = timezoneFor(ctx, s.user);
      return {
        ...base,
        title: REPORT_LABELS.employee + ' — ' + s.user.name,
        columns: [
          text('date', 'Date'),
          text('day', 'Day'),
          text('shift', 'Shift'),
          text('clockIn', 'In'),
          text('clockOut', 'Out'),
          text('worked', 'Worked'),
          num('breakMinutes', 'Break (min)'),
          num('lateByMinutes', 'Late (min)'),
          num('overtimeMinutes', 'Overtime (min)'),
          text('status', 'Status'),
          text('eod', 'EOD'),
        ],
        rows: s.days.map((d) => ({
          date: d.workDate,
          day: DateTime.fromISO(d.workDate).toFormat('ccc'),
          shift: d.schedule.working ? d.schedule.start + '–' + d.schedule.end : 'Off',
          clockIn: localTime(d.record?.clockIn, tz),
          clockOut: localTime(d.record?.clockOut, tz),
          worked: formatDuration(d.computed.workedMinutes),
          breakMinutes: d.computed.breakMinutes,
          lateByMinutes: d.computed.lateByMinutes,
          overtimeMinutes: d.computed.overtimeMinutes,
          status: STATUS_LABELS[d.status] ?? d.status,
          eod: d.eodSubmitted ? 'Yes' : d.computed.isWorkingDay ? 'No' : '',
        })),
      };
    }

    case REPORTS.WORK_LOG: {
      await connectDB();
      const users = await selectUsers({ ...filters, includeExempt: true });
      const ids = users.map((u) => u._id);
      const query = { userId: { $in: ids }, workDate: { $gte: from, $lte: to } };
      if (filters.projectId) query['tasks.projectId'] = filters.projectId;
      const eods = await Eod.find(query).sort({ workDate: 1 }).lean();
      const userById = new Map(users.map((u) => [String(u._id), u]));

      const rows = [];
      for (const eod of eods) {
        const user = userById.get(String(eod.userId));
        for (const task of eod.tasks ?? []) {
          if (filters.projectId && String(task.projectId ?? '') !== String(filters.projectId))
            continue;
          rows.push({
            date: eod.workDate,
            employeeId: user?.employeeId ?? '',
            name: user?.name ?? '',
            project: task.projectName ?? 'Internal / Other',
            title: task.title,
            description: task.description,
            minutes: task.minutes ?? '',
            status: task.status,
          });
        }
      }
      return {
        ...base,
        title: REPORT_LABELS['work-log'],
        columns: [
          text('date', 'Date'),
          text('employeeId', 'Employee ID'),
          text('name', 'Name'),
          text('project', 'Client / project'),
          text('title', 'Task'),
          text('description', 'Description'),
          num('minutes', 'Minutes'),
          text('status', 'Status'),
        ],
        rows,
      };
    }

    case REPORTS.MISSING_EODS: {
      const rows = [];
      let cursor = DateTime.fromISO(from);
      const end = DateTime.fromISO(to);
      for (let i = 0; i < 400 && cursor <= end; i += 1) {
        const date = cursor.toISODate();
        const missing = await missingEodsFor({
          workDate: date,
          office: filters.office ?? null,
          ctx,
        });
        for (const m of missing) {
          rows.push({
            date,
            employeeId: m.employeeId,
            name: m.name,
            department: m.department ?? '',
            office: m.office,
            autoClosed: m.autoClosed ? 'Yes' : 'No',
          });
        }
        cursor = cursor.plus({ days: 1 });
      }
      return {
        ...base,
        title: REPORT_LABELS['missing-eods'],
        columns: [
          text('date', 'Date'),
          text('employeeId', 'Employee ID'),
          text('name', 'Name'),
          text('department', 'Department'),
          text('office', 'Office'),
          text('autoClosed', 'Auto clocked out'),
        ],
        rows,
      };
    }

    case REPORTS.PAYROLL: {
      const users = await selectUsers(filters);
      const summaries = await summarise({ ctx, users, from, to, now });
      return {
        ...base,
        title: REPORT_LABELS.payroll,
        columns: [
          text('employeeId', 'Employee ID'),
          text('name', 'Name'),
          text('department', 'Department'),
          text('office', 'Office'),
          num('workingDays', 'Working days'),
          num('present', 'Present days'),
          num('paidLeaveDays', 'Paid leave'),
          num('unpaidLeaveDays', 'Unpaid leave'),
          num('absent', 'Absences'),
          num('late', 'Late count'),
          num('lateDeductionDays', 'Late deduction (days)'),
          num('halfDays', 'Half days'),
          num('otWeekday', 'OT weekday (min)'),
          num('otWeekend', 'OT weekend (min)'),
          num('otHoliday', 'OT holiday (min)'),
          num('wfh', 'WFH days'),
          num('officialDuty', 'Official duty days'),
          text('hours', 'Hours worked'),
        ],
        rows: summaries.map((s) => ({
          employeeId: s.user.employeeId,
          name: s.user.name,
          department: s.user.department ?? '',
          office: s.user.office,
          workingDays: s.workingDays,
          present: s.present,
          paidLeaveDays: s.paidLeaveDays,
          unpaidLeaveDays: s.unpaidLeaveDays,
          absent: s.absent,
          late: s.late,
          lateDeductionDays: s.lateDeductionDays,
          halfDays: s.halfDays,
          otWeekday: s.approvedOvertime.WEEKDAY,
          otWeekend: s.approvedOvertime.WEEKEND,
          otHoliday: s.approvedOvertime.HOLIDAY,
          wfh: s.wfh,
          officialDuty: s.officialDuty,
          hours: formatDuration(s.workedMinutes),
        })),
      };
    }

    default:
      throw new HttpError(400, 'That report does not exist.');
  }
}

/** Single-letter codes keep the register readable at a month's width. */
function shortCode(status) {
  switch (status) {
    case STATUS.PRESENT:
      return 'P';
    case STATUS.LATE:
      return 'L';
    case STATUS.EARLY_LEAVE:
      return 'E';
    case STATUS.HALF_DAY:
      return 'H';
    case STATUS.SHORT_LEAVE:
      return 'S';
    case STATUS.ABSENT:
      return 'A';
    case STATUS.ON_LEAVE:
      return 'LV';
    case STATUS.HOLIDAY:
      return 'HO';
    case STATUS.WEEKEND:
      return 'W';
    case STATUS.WFH:
      return 'R';
    case STATUS.OFFICIAL_DUTY:
      return 'OD';
    case STATUS.MISSING_CLOCK_OUT:
      return 'M';
    default:
      return '-';
  }
}

function localTime(instant, tz) {
  if (!instant) return '';
  return DateTime.fromJSDate(new Date(instant), { zone: tz }).toFormat('HH:mm');
}

/** Render a report as an .xlsx buffer. */
export async function toWorkbook(report) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LYRASET Workspace';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(report.title.slice(0, 30) || 'Report');
  sheet.columns = report.columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: Math.min(40, Math.max(10, c.label.length + 4)),
  }));

  sheet.addRows(
    report.rows.map((row) =>
      Object.fromEntries(
        report.columns.map((c) => {
          const value = row[c.key];
          if (c.type === 'number')
            return [c.key, value === '' || value == null ? null : Number(value)];
          return [c.key, value ?? ''];
        })
      )
    )
  );

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: report.columns.length },
  };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Render a report as CSV. */
export function toCsv(report) {
  const escape = (value) => {
    const s = value == null ? '' : String(value);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [report.columns.map((c) => escape(c.label)).join(',')];
  for (const row of report.rows) {
    lines.push(report.columns.map((c) => escape(row[c.key])).join(','));
  }
  return lines.join('\r\n');
}

/** A filename that sorts sensibly and says what it holds. */
export function reportFilename(report, extension) {
  const slug = report.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  return 'lyraset-' + slug + '-' + (report.window?.from ?? 'export') + '.' + extension;
}

export { summarise };
