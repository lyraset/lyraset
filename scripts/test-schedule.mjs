/**
 * Shift and schedule resolution tests — no database needed.
 *   npx tsx --test scripts/test-schedule.mjs
 *
 * Covers the edge cases called out in the spec: overnight shifts, date-range
 * overrides and a change of shift assignment.
 *
 * Fixture dates (Asia/Karachi): 2026-09-21 Mon, -25 Fri, -26 Sat, -27 Sun.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import {
  getScheduleForDay,
  resolveWorkDate,
  parseTimeToMinutes,
  formatMinutesAsTime,
  spanMinutes,
  dayKeyFor,
} from '../lib/workspace/calc/schedule.js';

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
    sun: { working: false, start: null, end: null, breakMinutes: 0 },
  },
};

const NIGHT = {
  _id: 'shift-night',
  name: 'Night — US clients',
  graceMinutes: 10,
  flexible: false,
  days: {
    mon: { working: true, start: '22:00', end: '06:00', breakMinutes: 30 },
    tue: { working: true, start: '22:00', end: '06:00', breakMinutes: 30 },
    wed: { working: true, start: '22:00', end: '06:00', breakMinutes: 30 },
    thu: { working: true, start: '22:00', end: '06:00', breakMinutes: 30 },
    fri: { working: false },
    sat: { working: false },
    sun: { working: false },
  },
};

const FLEXI = {
  _id: 'shift-flexi',
  name: 'Flexible',
  graceMinutes: 0,
  flexible: true,
  days: {
    mon: { working: true, start: '09:00', end: '17:00', breakMinutes: 0 },
    tue: { working: true, start: '09:00', end: '17:00', breakMinutes: 0 },
    wed: { working: true, start: '09:00', end: '17:00', breakMinutes: 0 },
    thu: { working: true, start: '09:00', end: '17:00', breakMinutes: 0 },
    fri: { working: true, start: '09:00', end: '17:00', breakMinutes: 0 },
    sat: { working: false },
    sun: { working: false },
  },
};

const ali = { id: 'u-ali', office: 'ISLAMABAD', timezone: KHI, shiftId: 'shift-standard' };
const mahnoor = { id: 'u-mah', office: 'DUBAI', timezone: DXB, shiftId: 'shift-standard' };

const resolve = (user, date, extra = {}) =>
  getScheduleForDay({ user, date, shifts: [STANDARD, NIGHT, FLEXI], ...extra });

test('time helpers round-trip', () => {
  assert.equal(parseTimeToMinutes('10:00'), 600);
  assert.equal(parseTimeToMinutes('09:30'), 570);
  assert.equal(parseTimeToMinutes('24:00'), null);
  assert.equal(parseTimeToMinutes('nonsense'), null);
  assert.equal(formatMinutesAsTime(600), '10:00');
  assert.equal(formatMinutesAsTime(570), '09:30');
  assert.equal(spanMinutes(600, 1140), 540);
  assert.equal(spanMinutes(1320, 360), 480, 'overnight span wraps past midnight');
});

test('dayKeyFor maps Luxon weekdays to shift keys', () => {
  assert.equal(dayKeyFor(DateTime.fromISO('2026-09-21', { zone: KHI })), 'mon');
  assert.equal(dayKeyFor(DateTime.fromISO('2026-09-27', { zone: KHI })), 'sun');
});

test('a standard Monday requires 8 hours after the hour-long break', () => {
  const s = resolve(ali, '2026-09-21');
  assert.equal(s.working, true);
  assert.equal(s.start, '10:00');
  assert.equal(s.end, '19:00');
  assert.equal(s.breakMinutes, 60);
  assert.equal(s.requiredMinutes, 480);
  assert.equal(s.overnight, false);
  assert.equal(s.shiftName, 'Standard');
});

test('Friday 10:00-18:00 with a 90-minute Jummah break requires 6.5 hours', () => {
  const s = resolve(ali, '2026-09-25');
  assert.equal(s.requiredMinutes, 390);
  assert.equal(s.requiredMinutes / 60, 6.5);
});

test('a short Saturday is a full working day, just a short one', () => {
  const s = resolve(ali, '2026-09-26');
  assert.equal(s.working, true);
  assert.equal(s.requiredMinutes, 240);
  assert.equal(s.breakMinutes, 0);
});

test('Sunday is an off day: nothing required, no absence possible', () => {
  const s = resolve(ali, '2026-09-27');
  assert.equal(s.working, false);
  assert.equal(s.requiredMinutes, 0);
  assert.equal(s.startAt, null);
});

test('grace is added to the start time, and only when the shift is fixed', () => {
  const s = resolve(ali, '2026-09-21');
  const start = DateTime.fromJSDate(s.startAt, { zone: KHI });
  const grace = DateTime.fromJSDate(s.graceUntil, { zone: KHI });
  assert.equal(start.toFormat('HH:mm'), '10:00');
  assert.equal(grace.toFormat('HH:mm'), '10:15');

  const flex = resolve({ ...ali, shiftId: 'shift-flexi' }, '2026-09-21');
  assert.equal(flex.flexible, true);
  assert.equal(flex.graceUntil, null, 'a flexible shift can never be late');
  assert.equal(flex.requiredMinutes, 480);
});

test('an overnight shift ends the next morning and keeps the starting date', () => {
  const s = resolve({ ...ali, shiftId: 'shift-night' }, '2026-09-21');
  assert.equal(s.overnight, true);
  assert.equal(s.requiredMinutes, 450, '8 hours gross less the 30-minute break');
  assert.equal(s.workDate, '2026-09-21');
  const end = DateTime.fromJSDate(s.endAt, { zone: KHI });
  assert.equal(end.toISODate(), '2026-09-22');
  assert.equal(end.toFormat('HH:mm'), '06:00');
});

test('an instant after midnight belongs to the night shift that is still running', () => {
  const night = { ...ali, shiftId: 'shift-night' };
  const args = { user: night, shifts: [STANDARD, NIGHT, FLEXI] };
  const at2am = DateTime.fromISO('2026-09-22T02:00', { zone: KHI }).toJSDate();
  assert.equal(resolveWorkDate({ instant: at2am, ...args }), '2026-09-21');

  const at8am = DateTime.fromISO('2026-09-22T08:00', { zone: KHI }).toJSDate();
  assert.equal(
    resolveWorkDate({ instant: at8am, ...args }),
    '2026-09-22',
    'after the shift ends it is a new day'
  );
});

test('a day shift never pulls an instant back to the previous date', () => {
  const at2am = DateTime.fromISO('2026-09-22T02:00', { zone: KHI }).toJSDate();
  assert.equal(
    resolveWorkDate({ instant: at2am, user: ali, shifts: [STANDARD, NIGHT, FLEXI] }),
    '2026-09-22'
  );
});

test('a date-range override replaces the day times while it is in force', () => {
  const ramadan = {
    _id: 'sched-ramadan',
    name: 'Ramadan timings',
    from: '2026-02-17',
    to: '2026-03-19',
    offices: [],
    days: {
      mon: { working: true, start: '10:00', end: '16:00', breakMinutes: 0 },
      wed: { working: true, start: '10:00', end: '16:00', breakMinutes: 0 },
    },
  };
  const inside = resolve(ali, '2026-03-18', { specialSchedules: [ramadan] });
  assert.equal(inside.requiredMinutes, 360);
  assert.equal(inside.source, 'OVERRIDE');
  assert.equal(inside.overrideName, 'Ramadan timings');

  const outside = resolve(ali, '2026-09-21', { specialSchedules: [ramadan] });
  assert.equal(outside.requiredMinutes, 480);
  assert.equal(outside.source, 'SHIFT');
});

test('an override only touches the days it names', () => {
  const earlyClose = {
    _id: 'sched-close',
    name: 'Early close',
    from: '2026-09-21',
    to: '2026-09-21',
    offices: [],
    days: { mon: { end: '15:00' } },
  };
  const s = resolve(ali, '2026-09-21', { specialSchedules: [earlyClose] });
  assert.equal(s.start, '10:00', 'the start time is untouched');
  assert.equal(s.end, '15:00');
  assert.equal(s.breakMinutes, 60, 'the break is untouched');
  assert.equal(s.requiredMinutes, 240);
});

test('an office-scoped override skips the other office', () => {
  const dubaiOnly = {
    _id: 'sched-dxb',
    name: 'Dubai early close',
    from: '2026-09-21',
    to: '2026-09-21',
    offices: ['DUBAI'],
    days: { mon: { working: true, start: '10:00', end: '15:00', breakMinutes: 0 } },
  };
  assert.equal(
    resolve(mahnoor, '2026-09-21', { specialSchedules: [dubaiOnly] }).requiredMinutes,
    300
  );
  assert.equal(resolve(ali, '2026-09-21', { specialSchedules: [dubaiOnly] }).requiredMinutes, 480);
});

test('an inactive override is ignored', () => {
  const off = {
    _id: 'sched-off',
    name: 'Retired override',
    active: false,
    from: '2026-09-21',
    to: '2026-09-21',
    offices: [],
    days: { mon: { working: false } },
  };
  assert.equal(resolve(ali, '2026-09-21', { specialSchedules: [off] }).working, true);
});

test('changing a shift assignment never rewrites history', () => {
  const assignments = [
    {
      userId: 'u-ali',
      shiftId: 'shift-standard',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-09-21',
    },
    { userId: 'u-ali', shiftId: 'shift-night', effectiveFrom: '2026-09-22', effectiveTo: null },
  ];
  const before = resolve({ ...ali, shiftId: null }, '2026-09-21', { assignments });
  const after = resolve({ ...ali, shiftId: null }, '2026-09-22', { assignments });
  assert.equal(before.shiftName, 'Standard');
  assert.equal(before.requiredMinutes, 480);
  assert.equal(after.shiftName, 'Night — US clients');
  assert.equal(after.overnight, true);
});

test('another employee’s assignment is never picked up', () => {
  const assignments = [
    {
      userId: 'someone-else',
      shiftId: 'shift-night',
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
    },
  ];
  const s = resolve(ali, '2026-09-21', { assignments });
  assert.equal(s.shiftName, 'Standard');
});

test('the latest overlapping assignment wins', () => {
  const assignments = [
    { userId: 'u-ali', shiftId: 'shift-standard', effectiveFrom: '2026-01-01', effectiveTo: null },
    { userId: 'u-ali', shiftId: 'shift-flexi', effectiveFrom: '2026-06-01', effectiveTo: null },
  ];
  assert.equal(
    resolve({ ...ali, shiftId: null }, '2026-09-21', { assignments }).shiftName,
    'Flexible'
  );
});

test('the same shift resolves to different instants in Dubai and Islamabad', () => {
  const khi = resolve(ali, '2026-09-21');
  const dxb = resolve(mahnoor, '2026-09-21');
  assert.equal(khi.requiredMinutes, dxb.requiredMinutes);
  assert.equal(DateTime.fromJSDate(dxb.startAt, { zone: DXB }).toFormat('HH:mm'), '10:00');
  // 10:00 in Dubai is an hour later in absolute terms than 10:00 in Karachi.
  assert.equal(dxb.startAt.getTime() - khi.startAt.getTime(), 60 * 60 * 1000);
});

test('with no shift at all the day is simply not a working day', () => {
  const s = getScheduleForDay({ user: { ...ali, shiftId: null }, date: '2026-09-21', shifts: [] });
  assert.equal(s.working, false);
  assert.equal(s.source, 'NONE');
  assert.equal(s.requiredMinutes, 0);
});

test('a default shift covers anyone with nothing assigned', () => {
  const s = getScheduleForDay({
    user: { ...ali, shiftId: null },
    date: '2026-09-21',
    shifts: [],
    defaultShift: STANDARD,
  });
  assert.equal(s.requiredMinutes, 480);
});
