/**
 * Leave arithmetic: which days a request actually consumes, how they split
 * across company months, what the quota allows, and what carries forward.
 *
 * Pure module. Calendar knowledge arrives as two callbacks (`isWorkingDay`,
 * `isHoliday`) so the same code serves the request form, the approval handler,
 * the cycle-rollover cron and the unit tests without touching a database.
 */
import { DateTime } from 'luxon';
import { getCycleForDate } from './cycle.js';

export const CARRY_FORWARD = Object.freeze({ LAPSE: 'LAPSE', CARRY: 'CARRY' });
export const OVER_QUOTA = Object.freeze({
  BLOCK: 'BLOCK',
  CONVERT_TO_UNPAID: 'CONVERT_TO_UNPAID',
});

export const DEFAULT_LEAVE_SETTINGS = Object.freeze({
  monthlyLeaveQuota: 2,
  leaveCarryForward: CARRY_FORWARD.LAPSE,
  maxCarryForward: 0,
  overQuotaBehavior: OVER_QUOTA.CONVERT_TO_UNPAID,
  sandwichRule: false,
});

function eachDate(from, to) {
  const start = DateTime.fromISO(String(from).slice(0, 10), { zone: 'utc' });
  const end = DateTime.fromISO(String(to).slice(0, 10), { zone: 'utc' });
  if (!start.isValid || !end.isValid || end < start) return [];
  const out = [];
  let cursor = start;
  for (let i = 0; i < 400 && cursor <= end; i += 1) {
    out.push(cursor.toISODate());
    cursor = cursor.plus({ days: 1 });
  }
  return out;
}

/**
 * Turn a date range into the days a leave request actually consumes.
 *
 * Weekends and holidays inside the range are free by default. With the
 * sandwich rule on, any non-working day *between* the first and last working
 * day of the request is charged too — so taking Friday and Monday off charges
 * the weekend as well. Days at the leading or trailing edge are never charged,
 * because a request that merely touches a weekend should not pay for it.
 *
 * @param {object} args
 * @param {string} args.from - YYYY-MM-DD
 * @param {string} args.to - YYYY-MM-DD
 * @param {boolean} [args.halfDay] - only meaningful for a single-day request
 * @param {(date:string)=>boolean} args.isWorkingDay
 * @param {(date:string)=>boolean} [args.isHoliday]
 * @param {boolean} [args.sandwichRule]
 * @returns {{entries:Array<{date:string,working:boolean,counted:boolean,portion:number}>,days:number}}
 */
export function expandLeaveDays({
  from,
  to,
  halfDay = false,
  isWorkingDay,
  isHoliday = () => false,
  sandwichRule = false,
}) {
  const dates = eachDate(from, to);
  const rows = dates.map((date) => ({
    date,
    working: Boolean(isWorkingDay(date)) && !isHoliday(date),
  }));

  const firstWorking = rows.findIndex((r) => r.working);
  let lastWorking = -1;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].working) {
      lastWorking = i;
      break;
    }
  }

  // A half day only makes sense on a single-day request.
  const portion = halfDay && dates.length === 1 ? 0.5 : 1;

  const entries = rows.map((row, index) => {
    const sandwiched =
      sandwichRule && firstWorking >= 0 && index > firstWorking && index < lastWorking;
    const counted = row.working || sandwiched;
    return {
      date: row.date,
      working: row.working,
      counted,
      portion: counted ? portion : 0,
    };
  });

  const days = entries.reduce((sum, e) => sum + e.portion, 0);
  return { entries, days: Math.round(days * 2) / 2 };
}

/**
 * Split counted leave days across company months.
 * A request that crosses a cycle boundary is charged to each cycle separately,
 * because each cycle has its own quota.
 *
 * @returns {Array<{cycleKey:string,cycleStart:Date,cycleEnd:Date,days:number,dates:string[]}>}
 */
export function splitLeaveByCycle(entries, cycleHistory, tz) {
  const buckets = new Map();
  for (const entry of entries ?? []) {
    if (!entry.counted) continue;
    const cycle = getCycleForDate(entry.date, cycleHistory, tz);
    const bucket = buckets.get(cycle.key) ?? {
      cycleKey: cycle.key,
      cycleLabel: cycle.label,
      cycleStart: cycle.start,
      cycleEnd: cycle.end,
      days: 0,
      dates: [],
    };
    bucket.days += entry.portion;
    bucket.dates.push(entry.date);
    buckets.set(cycle.key, bucket);
  }
  return [...buckets.values()]
    .map((b) => ({ ...b, days: Math.round(b.days * 2) / 2 }))
    .sort((a, b) => a.cycleStart - b.cycleStart);
}

/** Paid days still available in a cycle: quota plus carry-in, less used and pending. */
export function remainingPaidLeave(balance, settings = DEFAULT_LEAVE_SETTINGS) {
  const quota = Number(balance?.quota ?? settings.monthlyLeaveQuota ?? 0);
  const carriedIn = Number(balance?.carriedIn ?? 0);
  const used = Number(balance?.used ?? 0);
  const pending = Number(balance?.pending ?? 0);
  return Math.max(0, Math.round((quota + carriedIn - used - pending) * 2) / 2);
}

/**
 * Decide how a request is charged against the quota.
 *
 * Over-quota days are either blocked outright or converted to unpaid, whichever
 * the Owner configured. A per-type monthly limit is applied the same way, so
 * one setting governs both and the employee never sees two different rules.
 *
 * @returns {{paidDays:number,unpaidDays:number,blocked:boolean,reason:string|null,available:number}}
 */
export function applyQuota({
  days,
  leaveType,
  balance,
  settings = DEFAULT_LEAVE_SETTINGS,
  usedOfType = 0,
}) {
  const requested = Math.max(0, Number(days) || 0);
  const paid = leaveType?.paid !== false;
  const countsTowardQuota = paid && leaveType?.countsTowardQuota !== false;
  const behavior = settings.overQuotaBehavior ?? OVER_QUOTA.CONVERT_TO_UNPAID;

  const limits = [];
  if (countsTowardQuota) limits.push(remainingPaidLeave(balance, settings));
  if (leaveType?.monthlyLimit) {
    limits.push(Math.max(0, Number(leaveType.monthlyLimit) - Number(usedOfType || 0)));
  }
  const available = limits.length ? Math.min(...limits) : Infinity;

  if (requested === 0) {
    return { paidDays: 0, unpaidDays: 0, blocked: false, reason: null, available };
  }

  // An unpaid type never touches the paid quota; it can still hit its own limit.
  if (!paid) {
    if (requested > available) {
      return {
        paidDays: 0,
        unpaidDays: 0,
        blocked: true,
        reason:
          'This leave type allows ' +
          formatDays(available) +
          ' more day(s) this cycle. Shorten the request or pick another type.',
        available,
      };
    }
    return { paidDays: 0, unpaidDays: requested, blocked: false, reason: null, available };
  }

  if (requested <= available) {
    return { paidDays: requested, unpaidDays: 0, blocked: false, reason: null, available };
  }

  if (behavior === OVER_QUOTA.BLOCK) {
    return {
      paidDays: 0,
      unpaidDays: 0,
      blocked: true,
      reason:
        'You have ' +
        formatDays(available) +
        ' paid leave day(s) left this cycle and asked for ' +
        formatDays(requested) +
        '. Shorten the request or apply for unpaid leave.',
      available,
    };
  }

  const paidDays = Math.max(0, Math.min(requested, available));
  return {
    paidDays,
    unpaidDays: Math.round((requested - paidDays) * 2) / 2,
    blocked: false,
    reason:
      paidDays < requested
        ? formatDays(requested - paidDays) + ' day(s) go beyond your quota and will be unpaid.'
        : null,
    available,
  };
}

/** What an unused balance carries into the next cycle. */
export function computeCarryForward(balance, settings = DEFAULT_LEAVE_SETTINGS) {
  const unused = Math.max(
    0,
    Number(balance?.quota ?? 0) + Number(balance?.carriedIn ?? 0) - Number(balance?.used ?? 0)
  );
  if (settings.leaveCarryForward !== CARRY_FORWARD.CARRY) return 0;
  const cap = Number(settings.maxCarryForward ?? 0);
  return Math.round(Math.min(unused, cap) * 2) / 2;
}

/**
 * Whether a request satisfies the leave type's own rules.
 * Returns a list of human-readable problems; empty means it is fine to submit.
 */
export function validateAgainstType({
  leaveType,
  days,
  from,
  halfDay,
  hasDocument,
  now = new Date(),
  tz = 'utc',
}) {
  const problems = [];
  if (!leaveType) return ['Pick a leave type.'];
  if (leaveType.active === false) problems.push('That leave type is no longer available.');
  if (halfDay && leaveType.allowHalfDay === false) {
    problems.push('Half days are not allowed for ' + leaveType.name + '.');
  }

  const notice = Number(leaveType.minNoticeDays ?? 0);
  if (notice > 0) {
    const start = DateTime.fromISO(String(from).slice(0, 10), { zone: tz }).startOf('day');
    const today = DateTime.fromJSDate(now, { zone: tz }).startOf('day');
    const noticeGiven = Math.floor(start.diff(today, 'days').days);
    if (noticeGiven < notice) {
      problems.push(
        leaveType.name + ' needs ' + notice + ' day(s) notice. Pick a later start date.'
      );
    }
  }

  if (leaveType.requiresDocument) {
    const after = Number(leaveType.documentAfterDays ?? 0);
    if (days > after && !hasDocument) {
      problems.push(
        after > 0
          ? 'Attach a certificate for ' + leaveType.name + ' longer than ' + after + ' day(s).'
          : 'Attach the required document for ' + leaveType.name + '.'
      );
    }
  }

  return problems;
}

/** "1.5" / "2" — halves print, whole numbers do not gain a ".0". */
export function formatDays(value) {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 2) / 2;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
