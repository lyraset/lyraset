/**
 * The attendance status engine.
 *
 * One pure function decides what a day was: present, late, absent, on leave,
 * a holiday, and so on. Everything that reports on attendance — the dashboard
 * badge, the team sheet, the absence cron, the muster roll, payroll — calls
 * this, so there is exactly one definition of "late" in the system.
 *
 * Two deliberate choices worth knowing about:
 *   - `status` is a single primary label, but a day can be several things at
 *     once (late AND left early). The precise numbers always come back in
 *     `lateByMinutes` / `earlyByMinutes`, and every label that applied is in
 *     `flags`. Reports count lates from `lateByMinutes > 0`, never from the
 *     primary status, so a late-and-short day is still counted as late.
 *   - Nothing is marked ABSENT while the day is still running. Absence is only
 *     decided once the shift has ended (which is what the nightly cron does).
 */
import { DateTime } from 'luxon';

export const STATUS = Object.freeze({
  PRESENT: 'PRESENT',
  LATE: 'LATE',
  EARLY_LEAVE: 'EARLY_LEAVE',
  HALF_DAY: 'HALF_DAY',
  SHORT_LEAVE: 'SHORT_LEAVE',
  ABSENT: 'ABSENT',
  ON_LEAVE: 'ON_LEAVE',
  HOLIDAY: 'HOLIDAY',
  WEEKEND: 'WEEKEND',
  WFH: 'WFH',
  OFFICIAL_DUTY: 'OFFICIAL_DUTY',
  MISSING_CLOCK_OUT: 'MISSING_CLOCK_OUT',
  /** Working day, shift still running, nobody has clocked in yet. Not a failure. */
  NOT_MARKED: 'NOT_MARKED',
  /** The user is exempt from attendance (the CEO, or requiresAttendance: false). */
  EXEMPT: 'EXEMPT',
});

export const STATUS_LABELS = Object.freeze({
  PRESENT: 'Present',
  LATE: 'Late',
  EARLY_LEAVE: 'Left early',
  HALF_DAY: 'Half day',
  SHORT_LEAVE: 'Short leave',
  ABSENT: 'Absent',
  ON_LEAVE: 'On leave',
  HOLIDAY: 'Holiday',
  WEEKEND: 'Weekend',
  WFH: 'Work from home',
  OFFICIAL_DUTY: 'Official duty',
  MISSING_CLOCK_OUT: 'Missing clock-out',
  NOT_MARKED: 'Not clocked in',
  EXEMPT: 'Exempt',
});

/** Statuses that mean the employee was working, for attendance-rate maths. */
export const PRESENT_LIKE = Object.freeze([
  STATUS.PRESENT,
  STATUS.LATE,
  STATUS.EARLY_LEAVE,
  STATUS.HALF_DAY,
  STATUS.SHORT_LEAVE,
  STATUS.WFH,
  STATUS.OFFICIAL_DUTY,
  STATUS.MISSING_CLOCK_OUT,
]);

/** Statuses that are not working days at all, so they never count as absence. */
export const NON_WORKING = Object.freeze([STATUS.WEEKEND, STATUS.HOLIDAY, STATUS.EXEMPT]);

export const DEFAULT_RULES = Object.freeze({
  halfDayThresholdPercent: 50,
  paidBreaks: false,
  autoClockOutOffsetHours: 4,
  lateToDeduction: { lateCount: 3, deductionDays: 0.5 },
});

function toDT(value, tz) {
  if (value == null) return null;
  if (value instanceof Date) return DateTime.fromJSDate(value, { zone: tz });
  if (DateTime.isDateTime(value)) return value.setZone(tz);
  if (typeof value === 'string') {
    const dt = DateTime.fromISO(value, { zone: tz });
    return dt.isValid ? dt : null;
  }
  if (typeof value === 'number') return DateTime.fromMillis(value, { zone: tz });
  return null;
}

function diffMinutes(later, earlier) {
  if (!later || !earlier) return 0;
  return Math.max(0, Math.round(later.diff(earlier, 'minutes').minutes));
}

/**
 * Minutes spent on break. An open break is counted up to `now`, so the live
 * "worked today" timer stops moving the moment someone starts a break.
 */
export function computeBreakMinutes(breaks, now, tz = 'utc') {
  let total = 0;
  for (const b of breaks ?? []) {
    const start = toDT(b.start, tz);
    if (!start) continue;
    const end = toDT(b.end, tz) ?? toDT(now, tz);
    if (!end || end <= start) continue;
    total += Math.round(end.diff(start, 'minutes').minutes);
  }
  return Math.max(0, total);
}

/**
 * Minutes actually worked.
 *
 * When breaks are unpaid they come off the total, which is the usual case and
 * matches `schedule.requiredMinutes` (already net of the scheduled break).
 * When the Owner marks breaks paid, break time counts as worked and the
 * required minutes grow by the same amount, so the two stay comparable.
 */
export function computeWorkedMinutes(record, { now = new Date(), tz = 'utc', paidBreaks = false } = {}) {
  const clockIn = toDT(record?.clockIn, tz);
  if (!clockIn) return 0;
  const clockOut = toDT(record?.clockOut, tz) ?? toDT(now, tz);
  if (!clockOut || clockOut <= clockIn) return 0;
  const gross = Math.round(clockOut.diff(clockIn, 'minutes').minutes);
  if (paidBreaks) return Math.max(0, gross);
  return Math.max(0, gross - computeBreakMinutes(record?.breaks, now, tz));
}

/** The holiday covering this work date for this office, or null. */
export function findHoliday(holidays, workDate, office) {
  for (const h of holidays ?? []) {
    const date = typeof h.date === 'string' ? h.date.slice(0, 10) : toDT(h.date, 'utc')?.toISODate();
    if (date !== workDate) continue;
    const offices = h.offices ?? [];
    if (offices.length && office && !offices.includes(office)) continue;
    return h;
  }
  return null;
}

/**
 * The approved leave covering this work date, or null.
 * `dayPortion` is 1 for a full day, 0.5 for a half day; `hours` marks a short leave.
 */
export function findLeave(leaves, workDate) {
  for (const l of leaves ?? []) {
    if (l.status && l.status !== 'APPROVED') continue;
    const from = typeof l.from === 'string' ? l.from.slice(0, 10) : toDT(l.from, 'utc')?.toISODate();
    const to = typeof l.to === 'string' ? l.to.slice(0, 10) : toDT(l.to, 'utc')?.toISODate();
    if (!from || !to) continue;
    if (workDate < from || workDate > to) continue;
    return l;
  }
  return null;
}

/**
 * Decide what a single day was.
 *
 * @param {object} schedule - from getScheduleForDay
 * @param {object|null} record - the workspace_attendance row, or null
 * @param {Array} leaves - approved leave requests that might cover the day
 * @param {Array} holidays - the holiday calendar
 * @param {object} [options]
 * @param {object} [options.rules] - Owner-configured rules (see DEFAULT_RULES)
 * @param {string} [options.office]
 * @param {Date}   [options.now] - server time; decides whether the day is over
 * @param {boolean}[options.requiresAttendance]
 * @param {boolean}[options.wfh] - an approved work-from-home day
 * @param {boolean}[options.officialDuty] - an approved official-duty day
 * @returns {object} status, minutes and flags for the day
 */
export function computeDayStatus(schedule, record, leaves, holidays, options = {}) {
  const {
    rules = DEFAULT_RULES,
    office = null,
    now = new Date(),
    requiresAttendance = true,
    wfh = false,
    officialDuty = false,
  } = options;

  const tz = schedule?.tz || 'Asia/Karachi';
  const workDate = schedule?.workDate ?? null;
  const nowDT = toDT(now, tz);
  const paidBreaks = Boolean(rules.paidBreaks);
  const thresholdPercent = Number(rules.halfDayThresholdPercent ?? 50);

  const base = {
    workDate,
    status: STATUS.NOT_MARKED,
    flags: [],
    workedMinutes: 0,
    requiredMinutes: 0,
    breakMinutes: 0,
    lateByMinutes: 0,
    earlyByMinutes: 0,
    overtimeMinutes: 0,
    leaveDays: 0,
    isWorkingDay: false,
    countsAsPresent: false,
    holidayName: null,
  };

  // The CEO and anyone else marked exempt has no attendance at all.
  if (!requiresAttendance) return { ...base, status: STATUS.EXEMPT };

  const holiday = findHoliday(holidays, workDate, office);
  const leave = findLeave(leaves, workDate);

  const breakMinutes = computeBreakMinutes(record?.breaks, now, tz);
  const workedRaw = computeWorkedMinutes(record, { now, tz, paidBreaks });
  const clockIn = toDT(record?.clockIn, tz);
  const clockOut = toDT(record?.clockOut, tz);

  // A holiday outranks everything except work actually done on it (which is
  // holiday overtime, handled by the overtime claim, not by the status).
  if (holiday) {
    return {
      ...base,
      status: STATUS.HOLIDAY,
      holidayName: holiday.name ?? 'Holiday',
      workedMinutes: workedRaw,
      breakMinutes,
      countsAsPresent: false,
    };
  }

  if (!schedule?.working) {
    return {
      ...base,
      status: STATUS.WEEKEND,
      workedMinutes: workedRaw,
      breakMinutes,
    };
  }

  // From here on it is a working day.
  const scheduledRequired =
    Number(schedule.requiredMinutes || 0) + (paidBreaks ? Number(schedule.breakMinutes || 0) : 0);

  const portion = leave ? (leave.halfDay ? 0.5 : 1) : 0;
  const shortLeaveMinutes = leave && leave.hours ? Math.round(Number(leave.hours) * 60) : 0;

  // A full day of approved leave: nothing is required and nothing is owed.
  if (leave && portion === 1 && !shortLeaveMinutes) {
    return {
      ...base,
      status: STATUS.ON_LEAVE,
      isWorkingDay: true,
      leaveDays: 1,
      requiredMinutes: 0,
      workedMinutes: workedRaw,
      breakMinutes,
      countsAsPresent: false,
    };
  }

  // Half-day leave halves what is required; a short leave takes its hours off.
  let requiredMinutes = scheduledRequired;
  if (portion === 0.5) requiredMinutes = Math.round(scheduledRequired / 2);
  if (shortLeaveMinutes) requiredMinutes = Math.max(0, scheduledRequired - shortLeaveMinutes);

  const dayOver = schedule.endAt ? nowDT >= toDT(schedule.endAt, tz) : false;

  if (!clockIn) {
    // Approved WFH or official duty without a clock-in still counts as worked.
    if (wfh) {
      return { ...base, status: STATUS.WFH, isWorkingDay: true, requiredMinutes, countsAsPresent: true };
    }
    if (officialDuty) {
      return {
        ...base,
        status: STATUS.OFFICIAL_DUTY,
        isWorkingDay: true,
        requiredMinutes,
        countsAsPresent: true,
      };
    }
    if (portion === 0.5) {
      return {
        ...base,
        status: dayOver ? STATUS.HALF_DAY : STATUS.ON_LEAVE,
        isWorkingDay: true,
        leaveDays: 0.5,
        requiredMinutes,
        countsAsPresent: false,
      };
    }
    // Absence is only a fact once the shift has ended.
    return {
      ...base,
      status: dayOver ? STATUS.ABSENT : STATUS.NOT_MARKED,
      isWorkingDay: true,
      requiredMinutes,
    };
  }

  const flags = [];

  // Lateness. A flexible shift has no fixed start, so it can never be late.
  let lateByMinutes = 0;
  if (!schedule.flexible && schedule.graceUntil) {
    lateByMinutes = diffMinutes(clockIn, toDT(schedule.graceUntil, tz));
    if (lateByMinutes > 0) flags.push(STATUS.LATE);
  }

  // Leaving early, measured against the shift end, not against the grace.
  let earlyByMinutes = 0;
  if (!schedule.flexible && clockOut && schedule.endAt) {
    earlyByMinutes = diffMinutes(toDT(schedule.endAt, tz), clockOut);
    if (earlyByMinutes > 0) flags.push(STATUS.EARLY_LEAVE);
  }

  const openSession = !clockOut;

  // A day is only short once it is finished — someone ten minutes into their
  // shift has not worked a half day, they have simply not finished yet.
  const threshold = (requiredMinutes * thresholdPercent) / 100;
  const isHalfDay = !openSession && requiredMinutes > 0 && workedRaw < threshold;
  if (isHalfDay) flags.push(STATUS.HALF_DAY);

  const overtimeMinutes = Math.max(0, workedRaw - requiredMinutes);
  const autoClosed = Boolean(record?.autoClosed);

  let status;
  if (autoClosed) status = STATUS.MISSING_CLOCK_OUT;
  else if (officialDuty) status = STATUS.OFFICIAL_DUTY;
  else if (wfh) status = STATUS.WFH;
  else if (shortLeaveMinutes) status = STATUS.SHORT_LEAVE;
  else if (portion === 0.5) status = STATUS.ON_LEAVE;
  else if (openSession) status = lateByMinutes > 0 ? STATUS.LATE : STATUS.PRESENT;
  else if (isHalfDay) status = STATUS.HALF_DAY;
  else if (lateByMinutes > 0) status = STATUS.LATE;
  else if (earlyByMinutes > 0) status = STATUS.EARLY_LEAVE;
  else status = STATUS.PRESENT;

  if (autoClosed) flags.push(STATUS.MISSING_CLOCK_OUT);
  if (wfh) flags.push(STATUS.WFH);
  if (officialDuty) flags.push(STATUS.OFFICIAL_DUTY);

  return {
    workDate,
    status,
    flags: [...new Set(flags)],
    workedMinutes: workedRaw,
    requiredMinutes,
    breakMinutes,
    lateByMinutes,
    earlyByMinutes,
    overtimeMinutes,
    leaveDays: portion === 0.5 ? 0.5 : 0,
    isWorkingDay: true,
    countsAsPresent: true,
    holidayName: null,
  };
}

/**
 * Deduction days earned by lateness in a cycle, e.g. "every 3 lates costs half a day".
 * Counts from minutes late, so a day that is both late and short still counts.
 */
export function lateDeductionDays(lateCount, rules = DEFAULT_RULES) {
  const rule = rules.lateToDeduction ?? DEFAULT_RULES.lateToDeduction;
  const per = Number(rule?.lateCount) || 0;
  const cost = Number(rule?.deductionDays) || 0;
  if (per <= 0 || cost <= 0) return 0;
  return Math.floor(Number(lateCount || 0) / per) * cost;
}

/**
 * When an open session should be force-closed: the shift end plus the Owner's
 * offset. Used by both the cron and the lazy check on dashboard load.
 */
export function autoCloseDeadline(schedule, rules = DEFAULT_RULES) {
  if (!schedule?.endAt) return null;
  const offset = Number(rules.autoClockOutOffsetHours ?? DEFAULT_RULES.autoClockOutOffsetHours);
  return DateTime.fromJSDate(schedule.endAt, { zone: schedule.tz || 'utc' })
    .plus({ hours: offset })
    .toJSDate();
}

/** "7h 45m" — used in tables, exports and the dashboard timer. */
export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return m + 'm';
  return h + 'h ' + String(m).padStart(2, '0') + 'm';
}
