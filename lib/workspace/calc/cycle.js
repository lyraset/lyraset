/**
 * Company month (payroll cycle) arithmetic.
 *
 * The company month is not the calendar month: the Owner picks a start day
 * from 1 to 28, so a start day of 26 makes the "September" cycle run from
 * 26 August to 25 September. Everything monthly keys off this — dashboard
 * stats, the leave quota reset, late deductions, reports and the payroll lock.
 *
 * Changing the start day takes effect from the next cycle, never mid-cycle.
 * That is modelled as a chain: cycles run back to back with no gaps and no
 * overlaps, and each cycle's length is decided by the setting in force on the
 * day it begins. A change therefore produces one short transition cycle and
 * then settles into the new rhythm.
 *
 * Pure module — no database, no I/O. Every function takes the settings history
 * and a timezone so the same code runs in reports, crons and unit tests.
 */
import { DateTime } from 'luxon';

export const MIN_CYCLE_START_DAY = 1;
export const MAX_CYCLE_START_DAY = 28;

/** Guard against a runaway walk if a caller passes a nonsense date range. */
const MAX_ITERATIONS = 20000;

export function clampStartDay(day) {
  const n = Number(day);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_CYCLE_START_DAY, Math.max(MIN_CYCLE_START_DAY, Math.trunc(n)));
}

/** Accepts a Date, an ISO string or a Luxon DateTime and lands it in `tz`. */
export function toZoned(value, tz) {
  if (value instanceof DateTime) return value.setZone(tz);
  if (value instanceof Date) return DateTime.fromJSDate(value, { zone: tz });
  if (typeof value === 'string') {
    const iso = DateTime.fromISO(value, { zone: tz });
    if (iso.isValid) return iso;
  }
  if (typeof value === 'number') return DateTime.fromMillis(value, { zone: tz });
  return DateTime.invalid('unparseable date');
}

/**
 * Normalise `[{ day, effectiveFrom }]` into a sorted, deduped list.
 * An empty history means "day 1 since forever", which is the seed default.
 */
export function normalizeHistory(history, tz) {
  const raw = Array.isArray(history) ? history : [];
  const seen = new Map();
  for (const entry of raw) {
    const from = toZoned(entry?.effectiveFrom, tz);
    if (!from.isValid) continue;
    const key = from.startOf('day').toISODate();
    // A later entry with the same effective date supersedes the earlier one.
    seen.set(key, { day: clampStartDay(entry.day), effectiveFrom: from.startOf('day') });
  }
  const entries = [...seen.values()].sort((a, b) => a.effectiveFrom - b.effectiveFrom);
  if (!entries.length) {
    return [{ day: 1, effectiveFrom: DateTime.fromISO('1970-01-01', { zone: tz }).startOf('day') }];
  }
  return entries;
}

function settingAt(entries, dt) {
  let active = entries[0];
  for (const entry of entries) {
    if (entry.effectiveFrom <= dt) active = entry;
    else break;
  }
  return active;
}

/** The cycle start on or before `dt`, for one fixed start day. */
function startOnOrBefore(dt, day) {
  const day0 = dt.startOf('day');
  const thisMonth = day0.set({ day });
  return thisMonth <= day0 ? thisMonth : day0.minus({ months: 1 }).set({ day });
}

/** The next cycle start strictly after `cursor`. Start days are <= 28, so no month-length surprises. */
function nextBoundary(cursor, day) {
  const candidate = cursor.set({ day });
  return candidate > cursor ? candidate : cursor.plus({ months: 1 }).set({ day });
}

function makeCycle(start, endExclusive, startDay) {
  const end = endExclusive.minus({ days: 1 }).endOf('day');
  return {
    start: start.toJSDate(),
    end: end.toJSDate(),
    startDate: start.toISODate(),
    endDate: end.toISODate(),
    key: end.toFormat('yyyy-MM'),
    label: end.toFormat('LLLL yyyy'),
    startDay,
    days: Math.round(endExclusive.diff(start, 'days').days),
  };
}

/**
 * The company-month cycle containing `date`.
 *
 * @param {Date|string} date
 * @param {Array<{day:number, effectiveFrom:Date|string}>} history
 * @param {string} tz - IANA zone of the office the cycle is being computed for
 * @returns {{start:Date,end:Date,startDate:string,endDate:string,key:string,label:string,startDay:number,days:number}}
 */
export function getCycleForDate(date, history, tz) {
  const entries = normalizeHistory(history, tz);
  const dt = toZoned(date, tz);
  if (!dt.isValid) throw new TypeError('getCycleForDate: invalid date');
  const day0 = dt.startOf('day');

  // Fast path: the start day has never changed, so no chain walk is needed.
  if (entries.length === 1) {
    const { day } = entries[0];
    const start = startOnOrBefore(day0, day);
    return makeCycle(start, nextBoundary(start, day), day);
  }

  // Before the first recorded setting, extrapolate backwards from it.
  const chainStart = startOnOrBefore(entries[0].effectiveFrom, entries[0].day);
  if (day0 < chainStart) {
    const { day } = entries[0];
    const start = startOnOrBefore(day0, day);
    return makeCycle(start, nextBoundary(start, day), day);
  }

  let cursor = chainStart;
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const { day } = settingAt(entries, cursor);
    const next = nextBoundary(cursor, day);
    if (day0 < next) return makeCycle(cursor, next, day);
    cursor = next;
  }
  throw new RangeError('getCycleForDate: cycle chain did not converge');
}

/** The cycle immediately before the one containing `date`. */
export function getPreviousCycle(date, history, tz) {
  const current = getCycleForDate(date, history, tz);
  return getCycleForDate(toZoned(current.start, tz).minus({ days: 1 }).toJSDate(), history, tz);
}

/** The cycle immediately after the one containing `date`. */
export function getNextCycle(date, history, tz) {
  const current = getCycleForDate(date, history, tz);
  return getCycleForDate(toZoned(current.end, tz).plus({ days: 1 }).toJSDate(), history, tz);
}

/**
 * Every cycle overlapping the inclusive range [from, to], oldest first.
 * Used by reports, the payroll-close picker and carry-forward.
 */
export function listCycles(from, to, history, tz) {
  const start = toZoned(from, tz);
  const end = toZoned(to, tz);
  if (!start.isValid || !end.isValid) throw new TypeError('listCycles: invalid range');
  if (end < start) return [];

  const cycles = [];
  let cursor = getCycleForDate(start, history, tz);
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    cycles.push(cursor);
    if (toZoned(cursor.end, tz) >= end) break;
    cursor = getCycleForDate(toZoned(cursor.end, tz).plus({ days: 1 }), history, tz);
  }
  return cycles;
}

/** True when `date` falls inside `cycle`. Both ends inclusive. */
export function isWithinCycle(date, cycle, tz) {
  const dt = toZoned(date, tz);
  return dt >= toZoned(cycle.start, tz) && dt <= toZoned(cycle.end, tz);
}

/** Every calendar date in a cycle as YYYY-MM-DD, in office-local terms. */
export function cycleDates(cycle, tz) {
  const out = [];
  let cursor = toZoned(cycle.start, tz).startOf('day');
  const last = toZoned(cycle.end, tz).startOf('day');
  for (let i = 0; i < 400 && cursor <= last; i += 1) {
    out.push(cursor.toISODate());
    cursor = cursor.plus({ days: 1 });
  }
  return out;
}
