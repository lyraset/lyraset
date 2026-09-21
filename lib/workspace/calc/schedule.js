/**
 * Resolving "what was this person supposed to work on this day?"
 *
 * Three layers, applied in order:
 *   1. the shift assigned to the employee on that date (history-safe: changing
 *      someone's shift never rewrites what their past days required)
 *   2. any date-range override in force — Ramadan timings, a one-off early
 *      close — for their office
 *   3. the weekday rule inside whichever of those won
 *
 * Pure module: it takes plain data and returns plain data, so the same
 * resolution runs in the clock-in API, reports and tests.
 */
import { DateTime } from 'luxon';

/** Luxon weekday is 1 (Monday) to 7 (Sunday). */
export const DAY_KEYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export const EMPTY_DAY = Object.freeze({
  working: false,
  start: null,
  end: null,
  breakMinutes: 0,
});

export function dayKeyFor(dt) {
  return DAY_KEYS[dt.weekday - 1];
}

/** 'HH:mm' to minutes past midnight. Returns null for anything unparseable. */
export function parseTimeToMinutes(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatMinutesAsTime(total) {
  if (!Number.isFinite(total)) return null;
  const wrapped = ((Math.trunc(total) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(wrapped / 60)).padStart(2, '0');
  const mm = String(wrapped % 60).padStart(2, '0');
  return hh + ':' + mm;
}

/**
 * Span from start to end in minutes, treating an end earlier than the start as
 * running past midnight into the next day.
 */
export function spanMinutes(startMinutes, endMinutes) {
  if (startMinutes == null || endMinutes == null) return 0;
  const raw = endMinutes - startMinutes;
  return raw > 0 ? raw : raw + 1440;
}

function sameId(a, b) {
  if (!a || !b) return false;
  return String(a) === String(b);
}

function asDate(value, tz) {
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

/**
 * The shift assignment covering `dt`, or null.
 * Latest effectiveFrom wins, so a re-assignment supersedes an open-ended one.
 */
export function resolveAssignment(assignments, userId, dt) {
  const tz = dt.zoneName;
  const day0 = dt.startOf('day');
  let best = null;
  let bestFrom = null;
  for (const a of assignments ?? []) {
    if (userId != null && a.userId != null && !sameId(a.userId, userId)) continue;
    const from = asDate(a.effectiveFrom, tz);
    const to = asDate(a.effectiveTo, tz);
    if (from && from.startOf('day') > day0) continue;
    if (to && to.endOf('day') < day0) continue;
    if (!best || (from && bestFrom && from > bestFrom) || (from && !bestFrom)) {
      best = a;
      bestFrom = from;
    }
  }
  return best;
}

/**
 * The date-range override in force for this office on this day, or null.
 * An override with no office list applies everywhere. The latest start wins.
 */
export function resolveSpecialSchedule(specialSchedules, office, dt) {
  const tz = dt.zoneName;
  const day0 = dt.startOf('day');
  let best = null;
  let bestFrom = null;
  for (const s of specialSchedules ?? []) {
    if (s.active === false) continue;
    const offices = s.offices ?? [];
    if (offices.length && office && !offices.includes(office)) continue;
    const from = asDate(s.from, tz);
    const to = asDate(s.to, tz);
    if (!from || !to) continue;
    if (from.startOf('day') > day0 || to.endOf('day') < day0) continue;
    if (!best || from > bestFrom) {
      best = s;
      bestFrom = from;
    }
  }
  return best;
}

function stripEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

/**
 * What `user` was scheduled to work on `date`.
 *
 * @param {object} args
 * @param {{id?:string,_id?:string,office?:string,timezone?:string,shiftId?:string}} args.user
 * @param {Date|string} args.date - any instant on the work date, read in the user's zone
 * @param {Array} [args.assignments] - workspace_shift_assignments rows
 * @param {Array} [args.shifts] - workspace_shifts rows
 * @param {Array} [args.specialSchedules] - workspace_special_schedules rows
 * @param {object} [args.defaultShift] - used when nothing is assigned
 * @returns {object} resolved schedule for that day
 */
export function getScheduleForDay({
  user,
  date,
  assignments = [],
  shifts = [],
  specialSchedules = [],
  defaultShift = null,
}) {
  const tz = user?.timezone || 'Asia/Karachi';
  const dt = asDate(date, tz) ?? DateTime.now().setZone(tz);
  const day0 = dt.startOf('day');
  const workDate = day0.toISODate();
  const userId = user?.id ?? user?._id ?? null;

  const assignment = resolveAssignment(assignments, userId, day0);
  const shiftId = assignment?.shiftId ?? user?.shiftId ?? null;
  const shift =
    (shiftId && (shifts ?? []).find((s) => sameId(s._id ?? s.id, shiftId))) ||
    defaultShift ||
    (shifts ?? []).find((s) => s.isDefault) ||
    null;

  const key = dayKeyFor(day0);
  const baseDay = shift?.days?.[key] ?? EMPTY_DAY;

  const override = resolveSpecialSchedule(specialSchedules, user?.office, day0);
  const overrideDay = override?.days?.[key] ?? null;
  // A partial override (say, only a new end time) keeps the shift's other values.
  const day = overrideDay ? { ...baseDay, ...stripEmpty(overrideDay) } : baseDay;

  const flexible = Boolean(override?.flexible ?? shift?.flexible ?? false);
  const graceMinutes = Number(override?.graceMinutes ?? shift?.graceMinutes ?? 0) || 0;

  const startMinutes = parseTimeToMinutes(day.start);
  const endMinutes = parseTimeToMinutes(day.end);
  const breakMinutes = Math.max(0, Number(day.breakMinutes) || 0);
  const working = Boolean(day.working) && startMinutes != null && endMinutes != null;

  const common = {
    workDate,
    tz,
    graceMinutes,
    flexible,
    shiftId: shift ? String(shift._id ?? shift.id) : null,
    shiftName: shift?.name ?? null,
    overrideName: override?.name ?? null,
    source: override ? 'OVERRIDE' : shift ? 'SHIFT' : 'NONE',
  };

  if (!working) {
    return {
      ...common,
      working: false,
      start: null,
      end: null,
      breakMinutes: 0,
      overnight: false,
      requiredMinutes: 0,
      startAt: null,
      endAt: null,
      graceUntil: null,
    };
  }

  const overnight = endMinutes <= startMinutes;
  const grossMinutes = spanMinutes(startMinutes, endMinutes);
  // A short Saturday is a full working day, just a short one — the required
  // minutes shrink with it, so it is never scored as a half-day.
  const requiredMinutes = Math.max(0, grossMinutes - breakMinutes);

  const startAt = day0.plus({ minutes: startMinutes });
  const endAt = startAt.plus({ minutes: grossMinutes });

  return {
    ...common,
    working: true,
    start: formatMinutesAsTime(startMinutes),
    end: formatMinutesAsTime(endMinutes),
    breakMinutes,
    overnight,
    requiredMinutes,
    startAt: startAt.toJSDate(),
    endAt: endAt.toJSDate(),
    // A flexible shift has no fixed start, so nothing is ever late.
    graceUntil: flexible ? null : startAt.plus({ minutes: graceMinutes }).toJSDate(),
  };
}

/**
 * The work date an instant belongs to.
 *
 * An overnight shift that starts on Monday evening and ends Tuesday morning is
 * still Monday's attendance record, so an instant after midnight is pulled back
 * to the previous day while that day's shift is still running.
 */
export function resolveWorkDate({
  instant,
  user,
  assignments = [],
  shifts = [],
  specialSchedules = [],
  defaultShift = null,
}) {
  const tz = user?.timezone || 'Asia/Karachi';
  const dt = asDate(instant, tz) ?? DateTime.now().setZone(tz);
  const previous = getScheduleForDay({
    user,
    date: dt.minus({ days: 1 }),
    assignments,
    shifts,
    specialSchedules,
    defaultShift,
  });
  if (previous.working && previous.overnight) {
    const endAt = DateTime.fromJSDate(previous.endAt, { zone: tz });
    if (dt < endAt) return previous.workDate;
  }
  return dt.toISODate();
}
