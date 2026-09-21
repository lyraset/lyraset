import { P, can } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json } from '@/lib/workspace/route';
import { connectDB } from '@/lib/workspace/db';
import User, { toProfileUser } from '@/models/workspace/User';
import ShiftAssignment from '@/models/workspace/ShiftAssignment';
import Shift from '@/models/workspace/Shift';
import { getWorkspaceContext, scheduleFor, officeFor } from '@/lib/workspace/context';
import { maskStoredField } from '@/lib/workspace/crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Your own profile, read-only.
 *
 * Employees never edit their own details — the Owner keeps the HR record — so
 * there is no PATCH here. The national ID is only ever returned masked, even
 * to the person it belongs to.
 */
export const GET = api(async () => {
  const user = await requireApiPermission(P.PROFILE_VIEW_OWN);

  await connectDB();
  const found = await User.findById(user.id).select('+nationalId').lean();

  const ctx = await getWorkspaceContext();
  const [assignments, shifts] = await Promise.all([
    ShiftAssignment.find({ userId: user.id }).sort({ effectiveFrom: -1 }).lean(),
    Shift.find({}).select('name').lean(),
  ]);
  const shiftName = new Map(shifts.map((s) => [String(s._id), s.name]));
  const schedule = scheduleFor(ctx, { ...found, id: user.id }, new Date());

  return json({
    user: {
      ...toProfileUser(found),
      nationalIdMasked: maskStoredField(found.nationalId),
    },
    schedule: {
      shiftName: schedule.shiftName,
      working: schedule.working,
      start: schedule.start,
      end: schedule.end,
      breakMinutes: schedule.breakMinutes,
      requiredMinutes: schedule.requiredMinutes,
      graceMinutes: schedule.graceMinutes,
      flexible: schedule.flexible,
    },
    assignments: assignments.map((a) => ({
      id: String(a._id),
      shiftName: shiftName.get(String(a.shiftId)) ?? 'Unknown shift',
      effectiveFrom: a.effectiveFrom,
      effectiveTo: a.effectiveTo ?? null,
    })),
    office: (() => {
      const o = officeFor(ctx, found.office);
      // Only what the employee needs to know about the checks applied to them.
      return {
        code: o.code,
        name: o.name,
        timezone: o.timezone,
        selfieRequired: Boolean(o.selfieRequired),
        geofenceEnforced: Boolean(o.enforceGeofence),
        ipEnforced: Boolean(o.enforceIpAllowlist),
        policyNote: o.policyNote ?? null,
      };
    })(),
    canEditOwn: false,
    isOwner: can(user, P.EMPLOYEES_MANAGE),
  });
});
