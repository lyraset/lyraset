import { cache } from 'react';
import { connectDB } from './db.js';
import Settings, {
  SINGLETON_KEY,
  toRules,
  toLeaveSettings,
} from '../../models/workspace/Settings.js';
import Office from '../../models/workspace/Office.js';
import Shift from '../../models/workspace/Shift.js';
import ShiftAssignment from '../../models/workspace/ShiftAssignment.js';
import SpecialSchedule from '../../models/workspace/SpecialSchedule.js';
import Holiday from '../../models/workspace/Holiday.js';
import PayrollPeriod from '../../models/workspace/PayrollPeriod.js';
import { OFFICE_TIMEZONES } from '../../models/workspace/User.js';
import { getScheduleForDay, resolveWorkDate } from './calc/schedule.js';
import { getCycleForDate } from './calc/cycle.js';
import { HttpError } from './auth.js';

/**
 * The reference data every attendance calculation needs: company settings,
 * offices, shifts, assignments, overrides and the holiday calendar.
 *
 * All of it is small — tens to low hundreds of rows — and almost every request
 * needs most of it, so it is loaded once and cached for the lifetime of the
 * request rather than fetched piecemeal. React's `cache` dedupes it across a
 * page and all of its server components.
 */

/** Create the settings singleton on first use so the portal works out of the box. */
export async function ensureSettings() {
  await connectDB();
  const existing = await Settings.findOne({ key: SINGLETON_KEY }).lean();
  if (existing) return existing;
  await Settings.updateOne(
    { key: SINGLETON_KEY },
    { $setOnInsert: { key: SINGLETON_KEY } },
    { upsert: true }
  );
  return Settings.findOne({ key: SINGLETON_KEY }).lean();
}

export const getWorkspaceContext = cache(async () => {
  await connectDB();
  const [settings, offices, shifts, assignments, specialSchedules, holidays] = await Promise.all([
    ensureSettings(),
    Office.find({}).lean(),
    Shift.find({}).lean(),
    ShiftAssignment.find({}).lean(),
    SpecialSchedule.find({ active: true }).lean(),
    Holiday.find({}).lean(),
  ]);

  const defaultShift = shifts.find((s) => s.isDefault) ?? shifts.find((s) => s.active) ?? null;

  return {
    settings,
    rules: toRules(settings),
    leaveSettings: toLeaveSettings(settings),
    cycleHistory: settings?.cycleStartHistory ?? [],
    offices,
    shifts,
    assignments,
    specialSchedules,
    holidays,
    defaultShift,
  };
});

/** The office document for a code, or a sensible stand-in if it has not been created yet. */
export function officeFor(ctx, code) {
  return (
    ctx.offices.find((o) => o.code === code) ?? {
      code,
      name: code,
      timezone: OFFICE_TIMEZONES[code] ?? 'Asia/Karachi',
      weekendDays: [7],
      enforceIpAllowlist: false,
      ipAllowlist: [],
      enforceGeofence: false,
      geofence: { lat: null, lng: null, radiusM: 200 },
      selfieRequired: false,
    }
  );
}

/** The timezone a user's days are measured in: their own, else their office's. */
export function timezoneFor(ctx, user) {
  return user?.timezone || officeFor(ctx, user?.office).timezone || 'Asia/Karachi';
}

/** Resolve one user's schedule for one date, using the cached reference data. */
export function scheduleFor(ctx, user, date) {
  return getScheduleForDay({
    user: { ...user, timezone: timezoneFor(ctx, user) },
    date,
    assignments: ctx.assignments,
    shifts: ctx.shifts,
    specialSchedules: ctx.specialSchedules,
    defaultShift: ctx.defaultShift,
  });
}

/** Which work date an instant belongs to for this user (overnight shifts included). */
export function workDateFor(ctx, user, instant = new Date()) {
  return resolveWorkDate({
    instant,
    user: { ...user, timezone: timezoneFor(ctx, user) },
    assignments: ctx.assignments,
    shifts: ctx.shifts,
    specialSchedules: ctx.specialSchedules,
    defaultShift: ctx.defaultShift,
  });
}

/** The company-month cycle a date falls in, for this user's office. */
export function cycleFor(ctx, user, date) {
  return getCycleForDate(date, ctx.cycleHistory, timezoneFor(ctx, user));
}

/** Holidays that apply to an office, as a Set of 'YYYY-MM-DD' for quick lookups. */
export function holidayDatesFor(ctx, office) {
  const set = new Set();
  for (const h of ctx.holidays) {
    const offices = h.offices ?? [];
    if (offices.length && office && !offices.includes(office)) continue;
    set.add(String(h.date).slice(0, 10));
  }
  return set;
}

/**
 * Refuse to change anything inside a locked payroll period.
 *
 * Called by every write that touches a dated record — attendance edits, EOD
 * edits, leave approvals, request approvals — so "locked" means locked through
 * every route, not just the ones that remembered to check.
 */
export async function assertPeriodOpen({ office, date, ctx }) {
  const context = ctx ?? (await getWorkspaceContext());
  const tz = officeFor(context, office).timezone;
  const cycle = getCycleForDate(date, context.cycleHistory, tz);
  await connectDB();
  const period = await PayrollPeriod.findOne({ office, cycleKey: cycle.key }).lean();
  if (period?.status === 'LOCKED') {
    throw new HttpError(
      423,
      'The ' +
        cycle.label +
        ' period for ' +
        office +
        ' is locked. Ask the Owner to unlock it first.'
    );
  }
  return cycle;
}

/** True when the period covering this date is locked. For read-only UI hints. */
export async function isPeriodLocked({ office, date, ctx }) {
  try {
    await assertPeriodOpen({ office, date, ctx });
    return false;
  } catch {
    return true;
  }
}
