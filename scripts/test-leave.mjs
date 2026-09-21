/**
 * Leave arithmetic tests — no database needed.
 *   npx tsx --test scripts/test-leave.mjs
 *
 * Covers the edge cases called out in the spec: the monthly quota,
 * carry-forward, over-quota conversion, the sandwich rule, half-days and
 * requests that span two company months.
 *
 * Fixture dates (Asia/Karachi): 2026-09-24 Thu, -25 Fri, -26 Sat, -27 Sun, -28 Mon.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import {
  expandLeaveDays,
  splitLeaveByCycle,
  applyQuota,
  computeCarryForward,
  remainingPaidLeave,
  validateAgainstType,
  formatDays,
  CARRY_FORWARD,
  OVER_QUOTA,
  DEFAULT_LEAVE_SETTINGS,
} from '../lib/workspace/calc/leave.js';

const TZ = 'Asia/Karachi';

/** A Monday-to-Friday working week, as in the Dubai office. */
const monToFri = (date) => {
  const wd = DateTime.fromISO(date, { zone: TZ }).weekday;
  return wd >= 1 && wd <= 5;
};

const CASUAL = { name: 'Casual', code: 'CL', paid: true, countsTowardQuota: true, allowHalfDay: true };
const UNPAID = { name: 'Unpaid', code: 'UP', paid: false, countsTowardQuota: false, allowHalfDay: false };
const SICK = {
  name: 'Sick',
  code: 'SL',
  paid: true,
  countsTowardQuota: true,
  allowHalfDay: true,
  requiresDocument: true,
  documentAfterDays: 2,
};

const balance = (over = {}) => ({ quota: 2, carriedIn: 0, used: 0, pending: 0, ...over });

test('weekends inside a range are free unless the sandwich rule is on', () => {
  const args = { from: '2026-09-25', to: '2026-09-28', isWorkingDay: monToFri };
  const plain = expandLeaveDays({ ...args, sandwichRule: false });
  assert.equal(plain.days, 2, 'Friday and Monday only');
  assert.deepEqual(
    plain.entries.filter((e) => e.counted).map((e) => e.date),
    ['2026-09-25', '2026-09-28']
  );

  const sandwich = expandLeaveDays({ ...args, sandwichRule: true });
  assert.equal(sandwich.days, 4, 'the trapped weekend is charged too');
  assert.equal(sandwich.entries.every((e) => e.counted), true);
});

test('the sandwich rule never charges a weekend at the edge of a request', () => {
  const leading = expandLeaveDays({
    from: '2026-09-26',
    to: '2026-09-28',
    isWorkingDay: monToFri,
    sandwichRule: true,
  });
  assert.equal(leading.days, 1, 'a request that merely starts on a Saturday pays for Monday only');

  const trailing = expandLeaveDays({
    from: '2026-09-25',
    to: '2026-09-27',
    isWorkingDay: monToFri,
    sandwichRule: true,
  });
  assert.equal(trailing.days, 1, 'and a trailing weekend is free as well');
});

test('holidays inside a range are free, and charged when sandwiched', () => {
  const isHoliday = (d) => d === '2026-09-24';
  const args = { from: '2026-09-23', to: '2026-09-25', isWorkingDay: monToFri, isHoliday };
  assert.equal(expandLeaveDays({ ...args, sandwichRule: false }).days, 2);
  assert.equal(expandLeaveDays({ ...args, sandwichRule: true }).days, 3);
});

test('a half day counts as 0.5, and only on a single-day request', () => {
  const single = expandLeaveDays({
    from: '2026-09-25',
    to: '2026-09-25',
    halfDay: true,
    isWorkingDay: monToFri,
  });
  assert.equal(single.days, 0.5);

  const spread = expandLeaveDays({
    from: '2026-09-24',
    to: '2026-09-25',
    halfDay: true,
    isWorkingDay: monToFri,
  });
  assert.equal(spread.days, 2, 'a half day makes no sense across a range, so it is ignored');
});

test('a range that is entirely non-working costs nothing', () => {
  const r = expandLeaveDays({ from: '2026-09-26', to: '2026-09-27', isWorkingDay: monToFri });
  assert.equal(r.days, 0);
});

test('an inverted or invalid range yields no days', () => {
  assert.equal(expandLeaveDays({ from: '2026-09-28', to: '2026-09-25', isWorkingDay: monToFri }).days, 0);
  assert.equal(expandLeaveDays({ from: 'nope', to: 'nope', isWorkingDay: monToFri }).days, 0);
});

test('a request spanning two company months is split and charged to each', () => {
  const history = [{ day: 26, effectiveFrom: '2020-01-01' }];
  const { entries } = expandLeaveDays({ from: '2026-09-24', to: '2026-09-29', isWorkingDay: monToFri });
  const split = splitLeaveByCycle(entries, history, TZ);
  assert.equal(split.length, 2);
  assert.equal(split[0].cycleKey, '2026-09');
  assert.equal(split[0].days, 2, 'the 24th and 25th fall in the September cycle');
  assert.equal(split[1].cycleKey, '2026-10');
  assert.equal(split[1].days, 2, 'the 28th and 29th fall in the October cycle');
});

test('a request inside one cycle produces a single split', () => {
  const history = [{ day: 1, effectiveFrom: '2020-01-01' }];
  const { entries } = expandLeaveDays({ from: '2026-09-07', to: '2026-09-09', isWorkingDay: monToFri });
  const split = splitLeaveByCycle(entries, history, TZ);
  assert.equal(split.length, 1);
  assert.equal(split[0].days, 3);
});

test('remaining paid leave subtracts both used and pending days', () => {
  assert.equal(remainingPaidLeave(balance()), 2);
  assert.equal(remainingPaidLeave(balance({ used: 1 })), 1);
  assert.equal(remainingPaidLeave(balance({ used: 1, pending: 0.5 })), 0.5);
  assert.equal(remainingPaidLeave(balance({ carriedIn: 1 })), 3);
  assert.equal(remainingPaidLeave(balance({ used: 5 })), 0, 'never negative');
});

test('inside the quota, every day is paid', () => {
  const r = applyQuota({ days: 2, leaveType: CASUAL, balance: balance(), settings: DEFAULT_LEAVE_SETTINGS });
  assert.deepEqual([r.paidDays, r.unpaidDays, r.blocked], [2, 0, false]);
});

test('over the quota with CONVERT_TO_UNPAID: the excess becomes unpaid', () => {
  const settings = { ...DEFAULT_LEAVE_SETTINGS, overQuotaBehavior: OVER_QUOTA.CONVERT_TO_UNPAID };
  const r = applyQuota({ days: 3, leaveType: CASUAL, balance: balance(), settings });
  assert.equal(r.blocked, false);
  assert.equal(r.paidDays, 2);
  assert.equal(r.unpaidDays, 1);
  assert.match(r.reason, /unpaid/);
});

test('over the quota with BLOCK: the request is refused with a usable message', () => {
  const settings = { ...DEFAULT_LEAVE_SETTINGS, overQuotaBehavior: OVER_QUOTA.BLOCK };
  const r = applyQuota({ days: 3, leaveType: CASUAL, balance: balance(), settings });
  assert.equal(r.blocked, true);
  assert.equal(r.paidDays, 0);
  assert.match(r.reason, /2 paid leave day/);
});

test('a half-day request against half a day of quota is exactly covered', () => {
  const settings = { ...DEFAULT_LEAVE_SETTINGS, overQuotaBehavior: OVER_QUOTA.CONVERT_TO_UNPAID };
  const r = applyQuota({ days: 0.5, leaveType: CASUAL, balance: balance({ used: 1.5 }), settings });
  assert.deepEqual([r.paidDays, r.unpaidDays, r.blocked], [0.5, 0, false]);

  const over = applyQuota({ days: 1, leaveType: CASUAL, balance: balance({ used: 1.5 }), settings });
  assert.equal(over.paidDays, 0.5);
  assert.equal(over.unpaidDays, 0.5);
});

test('an unpaid leave type never touches the paid quota', () => {
  const r = applyQuota({ days: 5, leaveType: UNPAID, balance: balance({ used: 2 }), settings: DEFAULT_LEAVE_SETTINGS });
  assert.deepEqual([r.paidDays, r.unpaidDays, r.blocked], [0, 5, false]);
});

test('a paid type that does not count toward quota is unlimited by the quota', () => {
  const type = { ...CASUAL, countsTowardQuota: false };
  const r = applyQuota({ days: 6, leaveType: type, balance: balance({ used: 2 }), settings: DEFAULT_LEAVE_SETTINGS });
  assert.deepEqual([r.paidDays, r.unpaidDays, r.blocked], [6, 0, false]);
});

test('a per-type monthly limit is applied the same way as the quota', () => {
  const settings = { ...DEFAULT_LEAVE_SETTINGS, overQuotaBehavior: OVER_QUOTA.CONVERT_TO_UNPAID };
  const type = { ...CASUAL, monthlyLimit: 1 };
  const r = applyQuota({ days: 2, leaveType: type, balance: balance(), settings, usedOfType: 0 });
  assert.equal(r.paidDays, 1, 'the tighter of quota and type limit wins');
  assert.equal(r.unpaidDays, 1);

  const spent = applyQuota({ days: 1, leaveType: type, balance: balance(), settings, usedOfType: 1 });
  assert.equal(spent.paidDays, 0);
  assert.equal(spent.unpaidDays, 1);
});

test('an unpaid type over its own limit is blocked, since there is nothing to convert to', () => {
  const type = { ...UNPAID, monthlyLimit: 2 };
  const r = applyQuota({ days: 3, leaveType: type, balance: balance(), settings: DEFAULT_LEAVE_SETTINGS });
  assert.equal(r.blocked, true);
});

test('a zero-day request is a no-op, not an error', () => {
  const r = applyQuota({ days: 0, leaveType: CASUAL, balance: balance(), settings: DEFAULT_LEAVE_SETTINGS });
  assert.deepEqual([r.paidDays, r.unpaidDays, r.blocked], [0, 0, false]);
});

test('LAPSE throws away whatever was left', () => {
  const settings = { ...DEFAULT_LEAVE_SETTINGS, leaveCarryForward: CARRY_FORWARD.LAPSE, maxCarryForward: 5 };
  assert.equal(computeCarryForward({ quota: 2, carriedIn: 0, used: 0 }, settings), 0);
});

test('CARRY moves the unused balance forward, up to the cap', () => {
  const settings = { ...DEFAULT_LEAVE_SETTINGS, leaveCarryForward: CARRY_FORWARD.CARRY, maxCarryForward: 1 };
  assert.equal(computeCarryForward({ quota: 2, carriedIn: 0, used: 0 }, settings), 1, 'capped');
  assert.equal(computeCarryForward({ quota: 2, carriedIn: 0, used: 1.5 }, settings), 0.5, 'under the cap');
  assert.equal(computeCarryForward({ quota: 2, carriedIn: 0, used: 2 }, settings), 0, 'nothing left');
  assert.equal(computeCarryForward({ quota: 2, carriedIn: 0, used: 3 }, settings), 0, 'never negative');
});

test('carry-in counts toward what can carry forward again', () => {
  const settings = { ...DEFAULT_LEAVE_SETTINGS, leaveCarryForward: CARRY_FORWARD.CARRY, maxCarryForward: 5 };
  assert.equal(computeCarryForward({ quota: 2, carriedIn: 1, used: 0 }, settings), 3);
});

test('leave types enforce their own rules before the quota is even consulted', () => {
  const now = DateTime.fromISO('2026-09-21', { zone: TZ }).toJSDate();

  assert.deepEqual(validateAgainstType({ leaveType: null, days: 1, from: '2026-09-28', now, tz: TZ }), [
    'Pick a leave type.',
  ]);

  const retired = validateAgainstType({
    leaveType: { ...CASUAL, active: false },
    days: 1,
    from: '2026-09-28',
    now,
    tz: TZ,
  });
  assert.match(retired[0], /no longer available/);

  const noHalf = validateAgainstType({
    leaveType: { ...CASUAL, allowHalfDay: false },
    days: 0.5,
    halfDay: true,
    from: '2026-09-28',
    now,
    tz: TZ,
  });
  assert.match(noHalf[0], /Half days are not allowed/);
});

test('minimum notice is measured in whole days from today', () => {
  const now = DateTime.fromISO('2026-09-21', { zone: TZ }).toJSDate();
  const type = { ...CASUAL, minNoticeDays: 3 };
  assert.equal(validateAgainstType({ leaveType: type, days: 1, from: '2026-09-24', now, tz: TZ }).length, 0);
  const short = validateAgainstType({ leaveType: type, days: 1, from: '2026-09-22', now, tz: TZ });
  assert.equal(short.length, 1);
  assert.match(short[0], /needs 3 day\(s\) notice/);
});

test('a certificate is only required past the configured length', () => {
  const now = DateTime.fromISO('2026-09-21', { zone: TZ }).toJSDate();
  const within = validateAgainstType({ leaveType: SICK, days: 2, from: '2026-09-22', hasDocument: false, now, tz: TZ });
  assert.equal(within.length, 0, 'two days needs nothing');

  const longer = validateAgainstType({ leaveType: SICK, days: 3, from: '2026-09-22', hasDocument: false, now, tz: TZ });
  assert.equal(longer.length, 1);
  assert.match(longer[0], /Attach a certificate/);

  const attached = validateAgainstType({ leaveType: SICK, days: 3, from: '2026-09-22', hasDocument: true, now, tz: TZ });
  assert.equal(attached.length, 0);
});

test('day counts print without noise', () => {
  assert.equal(formatDays(2), '2');
  assert.equal(formatDays(1.5), '1.5');
  assert.equal(formatDays(0), '0');
  assert.equal(formatDays(Infinity), '0');
});
