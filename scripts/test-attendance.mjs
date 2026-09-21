/**
 * Attendance status engine tests — no database needed.
 *   npx tsx --test scripts/test-attendance.mjs
 *
 * Every status in the spec table gets a case, plus the rules that decide the
 * numbers: grace, the half-day threshold, paid vs unpaid breaks, overtime and
 * the late-to-deduction rule.
 *
 * Fixture dates (Asia/Karachi): 2026-09-21 Mon, -25 Fri, -26 Sat, -27 Sun.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { getScheduleForDay } from '../lib/workspace/calc/schedule.js';
import {
  STATUS,
  computeDayStatus,
  computeWorkedMinutes,
  computeBreakMinutes,
  lateDeductionDays,
  autoCloseDeadline,
  formatDuration,
  findHoliday,
  findLeave,
  DEFAULT_RULES,
} from '../lib/workspace/calc/attendance.js';

const KHI = 'Asia/Karachi';
const DXB = 'Asia/Dubai';

const STANDARD = {
  _id: 'shift-standard',
  name: 'Standard',
  graceMinutes: 15,
  flexible: false,
  days: {
    mon: { working: true, start: '10:00', end: '19:00', breakMinutes: 60 },
    tue: { working: true, start: '10:00', end: '19:00', breakMinutes: 60 },
    wed: { working: true, start: '10:00', end: '19:00', breakMinutes: 60 },
    thu: { working: true, start: '10:00', end: '19:00', breakMinutes: 60 },
    fri: { working: true, start: '10:00', end: '18:00', breakMinutes: 90 },
    sat: { working: true, start: '10:00', end: '14:00', breakMinutes: 0 },
    sun: { working: false },
  },
};

const ali = { id: 'u-ali', office: 'ISLAMABAD', timezone: KHI, shiftId: 'shift-standard' };
const mahnoor = { id: 'u-mah', office: 'DUBAI', timezone: DXB, shiftId: 'shift-standard' };

const schedFor = (user, date) => getScheduleForDay({ user, date, shifts: [STANDARD] });

/** Build an instant on a work date, in the user's zone. */
const at = (date, time, tz = KHI) => DateTime.fromISO(date + 'T' + time, { zone: tz }).toJSDate();

/** Server "now" well after the shift has ended, so the day counts as finished. */
const afterWork = (date, tz = KHI) => at(date, '23:30', tz);

const run = (schedule, record, opts = {}) =>
  computeDayStatus(schedule, record, opts.leaves ?? [], opts.holidays ?? [], {
    office: 'ISLAMABAD',
    now: afterWork(schedule.workDate),
    ...opts,
  });

test('an exempt user has no attendance at all', () => {
  const s = schedFor(ali, '2026-09-21');
  const r = run(s, null, { requiresAttendance: false });
  assert.equal(r.status, STATUS.EXEMPT);
  assert.equal(r.isWorkingDay, false);
});

test('PRESENT: in on time, full hours', () => {
  const s = schedFor(ali, '2026-09-21');
  const r = run(s, { clockIn: at('2026-09-21', '09:58'), clockOut: at('2026-09-21', '19:05'), breaks: [] });
  assert.equal(r.status, STATUS.PRESENT);
  assert.equal(r.lateByMinutes, 0);
  assert.equal(r.earlyByMinutes, 0);
  assert.equal(r.workedMinutes, 547);
  assert.equal(r.requiredMinutes, 480);
  assert.deepEqual(r.flags, []);
});

test('arriving inside the grace window is not late', () => {
  const s = schedFor(ali, '2026-09-21');
  const r = run(s, { clockIn: at('2026-09-21', '10:15'), clockOut: at('2026-09-21', '19:00') });
  assert.equal(r.status, STATUS.PRESENT);
  assert.equal(r.lateByMinutes, 0);
});

test('LATE: past the grace window, with the minutes recorded', () => {
  const s = schedFor(ali, '2026-09-21');
  const r = run(s, { clockIn: at('2026-09-21', '10:40'), clockOut: at('2026-09-21', '19:30') });
  assert.equal(r.status, STATUS.LATE);
  assert.equal(r.lateByMinutes, 25, 'measured from the end of grace, not from the start time');
  assert.ok(r.flags.includes(STATUS.LATE));
});

test('EARLY_LEAVE: out before the shift ends', () => {
  const s = schedFor(ali, '2026-09-21');
  const r = run(s, { clockIn: at('2026-09-21', '10:00'), clockOut: at('2026-09-21', '18:30') });
  assert.equal(r.status, STATUS.EARLY_LEAVE);
  assert.equal(r.earlyByMinutes, 30);
});

test('late and early on the same day: both numbers survive, late leads', () => {
  const s = schedFor(ali, '2026-09-21');
  const r = run(s, { clockIn: at('2026-09-21', '11:00'), clockOut: at('2026-09-21', '18:00') });
  assert.equal(r.status, STATUS.LATE);
  assert.equal(r.lateByMinutes, 45);
  assert.equal(r.earlyByMinutes, 60);
  assert.ok(r.flags.includes(STATUS.LATE) && r.flags.includes(STATUS.EARLY_LEAVE));
});

test('HALF_DAY: under the threshold share of the required minutes', () => {
  const s = schedFor(ali, '2026-09-21');
  const r = run(s, { clockIn: at('2026-09-21', '10:00'), clockOut: at('2026-09-21', '13:00') });
  assert.equal(r.workedMinutes, 180);
  assert.equal(r.status, STATUS.HALF_DAY, '180 is under 50% of 480');
});

test('exactly on the threshold is not a half day', () => {
  const s = schedFor(ali, '2026-09-21');
  const r = run(s, { clockIn: at('2026-09-21', '10:00'), clockOut: at('2026-09-21', '14:00') });
  assert.equal(r.workedMinutes, 240);
  assert.equal(r.status, STATUS.EARLY_LEAVE, '240 is exactly 50% of 480, so it is short but not half');
});

test('a short Saturday worked in full is PRESENT, never a half day', () => {
  const s = schedFor(ali, '2026-09-26');
  assert.equal(s.requiredMinutes, 240);
  const r = run(s, { clockIn: at('2026-09-26', '10:00'), clockOut: at('2026-09-26', '14:00') });
  assert.equal(r.status, STATUS.PRESENT);
  assert.equal(r.workedMinutes, 240);
});

test('WEEKEND: an off day is never an absence', () => {
  const s = schedFor(ali, '2026-09-27');
  const r = run(s, null);
  assert.equal(r.status, STATUS.WEEKEND);
  assert.equal(r.isWorkingDay, false);
});

test('HOLIDAY: the calendar wins over the shift', () => {
  const s = schedFor(ali, '2026-09-21');
  const holidays = [{ date: '2026-09-21', name: 'Eid', offices: [] }];
  const r = run(s, null, { holidays });
  assert.equal(r.status, STATUS.HOLIDAY);
  assert.equal(r.holidayName, 'Eid');
});

test('a holiday scoped to the other office does not apply', () => {
  const s = schedFor(ali, '2026-09-21');
  const holidays = [{ date: '2026-09-21', name: 'UAE National Day', offices: ['DUBAI'] }];
  const r = run(s, null, { holidays, office: 'ISLAMABAD' });
  assert.equal(r.status, STATUS.ABSENT);
});

test('ABSENT only once the shift has ended', () => {
  const s = schedFor(ali, '2026-09-21');
  const during = run(s, null, { now: at('2026-09-21', '12:00') });
  assert.equal(during.status, STATUS.NOT_MARKED, 'the day is still running');
  const after = run(s, null, { now: afterWork('2026-09-21') });
  assert.equal(after.status, STATUS.ABSENT);
  assert.equal(after.isWorkingDay, true);
});

test('ON_LEAVE: an approved full day owes nothing', () => {
  const s = schedFor(ali, '2026-09-21');
  const leaves = [{ from: '2026-09-21', to: '2026-09-21', status: 'APPROVED' }];
  const r = run(s, null, { leaves });
  assert.equal(r.status, STATUS.ON_LEAVE);
  assert.equal(r.requiredMinutes, 0);
  assert.equal(r.leaveDays, 1);
});

test('a pending leave request does not excuse the day', () => {
  const s = schedFor(ali, '2026-09-21');
  const leaves = [{ from: '2026-09-21', to: '2026-09-21', status: 'PENDING' }];
  assert.equal(run(s, null, { leaves }).status, STATUS.ABSENT);
});

test('a half-day leave halves what is required', () => {
  const s = schedFor(ali, '2026-09-21');
  const leaves = [{ from: '2026-09-21', to: '2026-09-21', halfDay: true, status: 'APPROVED' }];
  const r = run(s, { clockIn: at('2026-09-21', '14:00'), clockOut: at('2026-09-21', '19:00') }, { leaves });
  assert.equal(r.status, STATUS.ON_LEAVE);
  assert.equal(r.requiredMinutes, 240);
  assert.equal(r.leaveDays, 0.5);
  assert.equal(r.workedMinutes, 300);
});

test('SHORT_LEAVE: a few approved hours come off the required minutes', () => {
  const s = schedFor(ali, '2026-09-21');
  const leaves = [{ from: '2026-09-21', to: '2026-09-21', hours: 2, status: 'APPROVED' }];
  const r = run(s, { clockIn: at('2026-09-21', '10:00'), clockOut: at('2026-09-21', '17:00') }, { leaves });
  assert.equal(r.status, STATUS.SHORT_LEAVE);
  assert.equal(r.requiredMinutes, 360);
});

test('WFH and OFFICIAL_DUTY are counted as worked days', () => {
  const s = schedFor(ali, '2026-09-21');
  const wfh = run(s, null, { wfh: true });
  assert.equal(wfh.status, STATUS.WFH);
  assert.equal(wfh.countsAsPresent, true);

  const duty = run(s, null, { officialDuty: true });
  assert.equal(duty.status, STATUS.OFFICIAL_DUTY);
  assert.equal(duty.countsAsPresent, true);
});

test('MISSING_CLOCK_OUT: an auto-closed session is flagged, whatever else applied', () => {
  const s = schedFor(ali, '2026-09-21');
  const r = run(s, {
    clockIn: at('2026-09-21', '10:00'),
    clockOut: at('2026-09-21', '23:00'),
    autoClosed: true,
  });
  assert.equal(r.status, STATUS.MISSING_CLOCK_OUT);
  assert.ok(r.flags.includes(STATUS.MISSING_CLOCK_OUT));
});

test('an open session mid-shift reads as present, not as a short day', () => {
  const s = schedFor(ali, '2026-09-21');
  const r = run(s, { clockIn: at('2026-09-21', '10:00') }, { now: at('2026-09-21', '11:00') });
  assert.equal(r.status, STATUS.PRESENT);
  assert.equal(r.workedMinutes, 60);
  assert.equal(r.flags.includes(STATUS.HALF_DAY), false);
});

test('an open session that started late still reads as late', () => {
  const s = schedFor(ali, '2026-09-21');
  const r = run(s, { clockIn: at('2026-09-21', '11:00') }, { now: at('2026-09-21', '12:00') });
  assert.equal(r.status, STATUS.LATE);
  assert.equal(r.lateByMinutes, 45);
});

test('unpaid breaks come off worked minutes; paid breaks do not', () => {
  const s = schedFor(ali, '2026-09-21');
  const record = {
    clockIn: at('2026-09-21', '10:00'),
    clockOut: at('2026-09-21', '19:00'),
    breaks: [{ type: 'LUNCH', start: at('2026-09-21', '13:00'), end: at('2026-09-21', '14:00') }],
  };
  const unpaid = run(s, record, { rules: { ...DEFAULT_RULES, paidBreaks: false } });
  assert.equal(unpaid.workedMinutes, 480);
  assert.equal(unpaid.requiredMinutes, 480);
  assert.equal(unpaid.status, STATUS.PRESENT);

  const paid = run(s, record, { rules: { ...DEFAULT_RULES, paidBreaks: true } });
  assert.equal(paid.workedMinutes, 540, 'break time counts as worked');
  assert.equal(paid.requiredMinutes, 540, 'and the required minutes grow to match');
  assert.equal(paid.status, STATUS.PRESENT);
});

test('an open break is counted up to now, so the live timer stops', () => {
  const breaks = [{ start: at('2026-09-21', '13:00'), end: null }];
  assert.equal(computeBreakMinutes(breaks, at('2026-09-21', '13:20'), KHI), 20);
  const worked = computeWorkedMinutes(
    { clockIn: at('2026-09-21', '10:00'), breaks },
    { now: at('2026-09-21', '13:20'), tz: KHI }
  );
  assert.equal(worked, 180, 'the clock stopped when the break started');
});

test('overtime is the excess over the required minutes', () => {
  const s = schedFor(ali, '2026-09-21');
  const r = run(s, { clockIn: at('2026-09-21', '10:00'), clockOut: at('2026-09-21', '21:00') });
  assert.equal(r.workedMinutes, 660);
  assert.equal(r.overtimeMinutes, 180);
});

test('a flexible shift is never late, only short', () => {
  const flexi = {
    _id: 'shift-flexi',
    name: 'Flexible',
    flexible: true,
    graceMinutes: 0,
    days: { mon: { working: true, start: '09:00', end: '17:00', breakMinutes: 0 } },
  };
  const s = getScheduleForDay({ user: { ...ali, shiftId: 'shift-flexi' }, date: '2026-09-21', shifts: [flexi] });
  const r = run(s, { clockIn: at('2026-09-21', '13:00'), clockOut: at('2026-09-21', '21:00') });
  assert.equal(r.lateByMinutes, 0);
  assert.equal(r.earlyByMinutes, 0);
  assert.equal(r.status, STATUS.PRESENT);
});

test('Dubai lateness is judged in Dubai time, not in Islamabad time', () => {
  const s = getScheduleForDay({ user: mahnoor, date: '2026-09-21', shifts: [STANDARD] });
  assert.equal(s.tz, DXB);
  // 10:20 Dubai is 11:20 in Karachi — late by 5 minutes locally, not by 65.
  const r = computeDayStatus(s, { clockIn: at('2026-09-21', '10:20', DXB), clockOut: at('2026-09-21', '19:00', DXB) }, [], [], {
    office: 'DUBAI',
    now: afterWork('2026-09-21', DXB),
  });
  assert.equal(r.status, STATUS.LATE);
  assert.equal(r.lateByMinutes, 5);
  assert.equal(r.workedMinutes, 520);
});

test('the late-to-deduction rule counts whole groups only', () => {
  const rules = { ...DEFAULT_RULES, lateToDeduction: { lateCount: 3, deductionDays: 0.5 } };
  assert.equal(lateDeductionDays(0, rules), 0);
  assert.equal(lateDeductionDays(2, rules), 0);
  assert.equal(lateDeductionDays(3, rules), 0.5);
  assert.equal(lateDeductionDays(5, rules), 0.5);
  assert.equal(lateDeductionDays(6, rules), 1);
  assert.equal(lateDeductionDays(6, { lateToDeduction: { lateCount: 0, deductionDays: 1 } }), 0);
});

test('the auto-close deadline is the shift end plus the configured offset', () => {
  const s = schedFor(ali, '2026-09-21');
  const deadline = autoCloseDeadline(s, { ...DEFAULT_RULES, autoClockOutOffsetHours: 4 });
  assert.equal(DateTime.fromJSDate(deadline, { zone: KHI }).toFormat('yyyy-MM-dd HH:mm'), '2026-09-21 23:00');
  assert.equal(autoCloseDeadline({ endAt: null }), null);
});

test('holiday and leave lookups respect office and status', () => {
  assert.equal(findHoliday([{ date: '2026-09-21', name: 'X', offices: [] }], '2026-09-21', 'DUBAI').name, 'X');
  assert.equal(findHoliday([{ date: '2026-09-22', name: 'X', offices: [] }], '2026-09-21', 'DUBAI'), null);
  assert.ok(findLeave([{ from: '2026-09-20', to: '2026-09-23', status: 'APPROVED' }], '2026-09-21'));
  assert.equal(findLeave([{ from: '2026-09-20', to: '2026-09-23', status: 'REJECTED' }], '2026-09-21'), null);
});

test('durations format for people, not for machines', () => {
  assert.equal(formatDuration(0), '0m');
  assert.equal(formatDuration(45), '45m');
  assert.equal(formatDuration(480), '8h 00m');
  assert.equal(formatDuration(465), '7h 45m');
});
