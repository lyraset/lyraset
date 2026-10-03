/**
 * Company-month (payroll cycle) tests — no database needed.
 *   npx tsx --test scripts/test-cycle.mjs
 *
 * Covers the edge cases called out in the spec: month boundaries, February,
 * the year rollover and a mid-year change of the start day.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCycleForDate,
  getPreviousCycle,
  getNextCycle,
  listCycles,
  cycleDates,
  isWithinCycle,
  clampStartDay,
  normalizeHistory,
} from '../lib/workspace/calc/cycle.js';

const TZ = 'Asia/Karachi';
const from = (day, effectiveFrom) => [{ day, effectiveFrom }];

function bounds(cycle) {
  return [cycle.startDate, cycle.endDate];
}

test('start day 1 gives the plain calendar month', () => {
  const c = getCycleForDate('2026-09-10', from(1, '2020-01-01'), TZ);
  assert.deepEqual(bounds(c), ['2026-09-01', '2026-09-30']);
  assert.equal(c.key, '2026-09');
  assert.equal(c.label, 'September 2026');
  assert.equal(c.days, 30);
});

test('start day 26: the September cycle runs 26 Aug to 25 Sep', () => {
  const c = getCycleForDate('2026-09-10', from(26, '2020-01-01'), TZ);
  assert.deepEqual(bounds(c), ['2026-08-26', '2026-09-25']);
  assert.equal(c.label, 'September 2026');
});

test('start day 26: a date on or after the 26th belongs to the next cycle', () => {
  const c = getCycleForDate('2026-09-28', from(26, '2020-01-01'), TZ);
  assert.deepEqual(bounds(c), ['2026-09-26', '2026-10-25']);
  assert.equal(c.label, 'October 2026');
});

test('the boundary day itself starts the new cycle, the day before ends the old one', () => {
  const history = from(26, '2020-01-01');
  assert.deepEqual(bounds(getCycleForDate('2026-09-25', history, TZ)), [
    '2026-08-26',
    '2026-09-25',
  ]);
  assert.deepEqual(bounds(getCycleForDate('2026-09-26', history, TZ)), [
    '2026-09-26',
    '2026-10-25',
  ]);
});

test('February is handled without slipping a day', () => {
  const history = from(26, '2020-01-01');
  assert.deepEqual(bounds(getCycleForDate('2026-02-10', history, TZ)), [
    '2026-01-26',
    '2026-02-25',
  ]);
  // Start day 28 is the maximum, so it exists in February too.
  const d28 = getCycleForDate('2026-03-01', from(28, '2020-01-01'), TZ);
  assert.deepEqual(bounds(d28), ['2026-02-28', '2026-03-27']);
});

test('a leap February keeps its extra day', () => {
  const c = getCycleForDate('2028-02-10', from(1, '2020-01-01'), TZ);
  assert.deepEqual(bounds(c), ['2028-02-01', '2028-02-29']);
  assert.equal(c.days, 29);
});

test('the cycle rolls over the year end', () => {
  const c = getCycleForDate('2026-01-05', from(26, '2020-01-01'), TZ);
  assert.deepEqual(bounds(c), ['2025-12-26', '2026-01-25']);
  assert.equal(c.key, '2026-01');
});

test('changing the start day takes effect from the next cycle, never mid-cycle', () => {
  const history = [
    { day: 1, effectiveFrom: '2026-01-01' },
    { day: 26, effectiveFrom: '2026-10-01' },
  ];
  // September still runs on the old rule.
  assert.deepEqual(bounds(getCycleForDate('2026-09-20', history, TZ)), [
    '2026-09-01',
    '2026-09-30',
  ]);
  // October is the short transition cycle.
  assert.deepEqual(bounds(getCycleForDate('2026-10-05', history, TZ)), [
    '2026-10-01',
    '2026-10-25',
  ]);
  // From then on the new rule holds.
  assert.deepEqual(bounds(getCycleForDate('2026-11-10', history, TZ)), [
    '2026-10-26',
    '2026-11-25',
  ]);
});

test('cycles are contiguous across a start-day change: no gaps, no overlaps', () => {
  const history = [
    { day: 1, effectiveFrom: '2026-01-01' },
    { day: 26, effectiveFrom: '2026-10-01' },
  ];
  const cycles = listCycles('2026-01-01', '2027-03-31', history, TZ);
  assert.ok(cycles.length >= 14);
  for (let i = 1; i < cycles.length; i += 1) {
    const prevEnd = new Date(cycles[i - 1].end);
    const start = new Date(cycles[i].start);
    const gapMs = start - prevEnd;
    // End is the last millisecond of a day, so the next start is 1ms later.
    assert.ok(
      gapMs > 0 && gapMs < 1000,
      'gap between ' + cycles[i - 1].endDate + ' and ' + cycles[i].startDate
    );
  }
  const keys = cycles.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length, 'cycle keys must be unique');
});

test('dates before the first recorded setting extrapolate backwards', () => {
  const history = [{ day: 26, effectiveFrom: '2026-06-01' }];
  assert.deepEqual(bounds(getCycleForDate('2024-03-03', history, TZ)), [
    '2024-02-26',
    '2024-03-25',
  ]);
});

test('previous and next cycles chain correctly', () => {
  const history = from(26, '2020-01-01');
  const current = getCycleForDate('2026-09-10', history, TZ);
  assert.deepEqual(bounds(getPreviousCycle('2026-09-10', history, TZ)), [
    '2026-07-26',
    '2026-08-25',
  ]);
  assert.deepEqual(bounds(getNextCycle('2026-09-10', history, TZ)), ['2026-09-26', '2026-10-25']);
  assert.equal(current.key, '2026-09');
});

test('isWithinCycle covers both ends inclusively', () => {
  const c = getCycleForDate('2026-09-10', from(26, '2020-01-01'), TZ);
  assert.ok(isWithinCycle('2026-08-26', c, TZ));
  assert.ok(isWithinCycle('2026-09-25', c, TZ));
  assert.equal(isWithinCycle('2026-08-25', c, TZ), false);
  assert.equal(isWithinCycle('2026-09-26', c, TZ), false);
});

test('cycleDates lists every day in the cycle', () => {
  const c = getCycleForDate('2026-09-10', from(26, '2020-01-01'), TZ);
  const dates = cycleDates(c, TZ);
  assert.equal(dates.length, 31);
  assert.equal(dates[0], '2026-08-26');
  assert.equal(dates.at(-1), '2026-09-25');
});

test('a cycle starts at midnight in Pakistan, not at midnight UTC', () => {
  const history = from(1, '2020-01-01');
  const cycle = getCycleForDate('2026-09-15', history, 'Asia/Karachi');
  assert.deepEqual(bounds(cycle), ['2026-09-01', '2026-09-30']);
  // Midnight in Pakistan (UTC+5) is 19:00 UTC the evening before.
  assert.equal(cycle.start.toISOString(), '2026-08-31T19:00:00.000Z');
  // So 23:00 UTC on 30 September is already 1 October there: the next cycle.
  const next = getCycleForDate(new Date('2026-09-30T23:00:00Z'), history, 'Asia/Karachi');
  assert.deepEqual(bounds(next), ['2026-10-01', '2026-10-31']);
});

test('the start day is clamped to 1..28', () => {
  assert.equal(clampStartDay(0), 1);
  assert.equal(clampStartDay(31), 28);
  assert.equal(clampStartDay('15'), 15);
  assert.equal(clampStartDay(undefined), 1);
});

test('an empty history behaves as start day 1 since forever', () => {
  const entries = normalizeHistory([], TZ);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].day, 1);
  assert.deepEqual(bounds(getCycleForDate('2026-09-10', [], TZ)), ['2026-09-01', '2026-09-30']);
});

test('two settings on the same effective date: the later one wins', () => {
  const history = [
    { day: 5, effectiveFrom: '2026-01-01' },
    { day: 10, effectiveFrom: '2026-01-01' },
  ];
  const entries = normalizeHistory(history, TZ);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].day, 10);
});

test('a Date object and an ISO string give the same cycle', () => {
  const history = from(26, '2020-01-01');
  const a = getCycleForDate(new Date('2026-09-10T08:00:00Z'), history, TZ);
  const b = getCycleForDate('2026-09-10', history, TZ);
  assert.deepEqual(bounds(a), bounds(b));
});
