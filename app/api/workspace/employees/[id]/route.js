import { z } from 'zod';
import {
  P,
  can,
  canAssignRole,
  canManageAccount,
  ASSIGNABLE_ROLES,
} from '@/lib/workspace/permissions';
import { requireApiUser, HttpError } from '@/lib/workspace/auth';
import { api, json, readJson, params } from '@/lib/workspace/route';
import { parseBody, objectId, dateString, asset } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import User, {
  toSafeUser,
  toProfileUser,
  OFFICES,
  WORK_MODES,
  EMPLOYMENT_TYPES,
  EXIT_TYPES,
} from '@/models/workspace/User';
import Department from '@/models/workspace/Department';
import ShiftAssignment from '@/models/workspace/ShiftAssignment';
import { encryptField, maskStoredField } from '@/lib/workspace/crypto';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * One employee.
 *
 * What comes back depends on who is asking, which is the whole of section 5's
 * visibility rule in one place:
 *   - the Owner, and the person themselves, get the HR profile
 *   - the MD and CEO get directory fields only, never personal details
 */
export const GET = api(async (req, context) => {
  const actor = await requireApiUser();
  const { id } = await params(context);

  await connectDB();
  const found = await User.findById(id).select('+nationalId').lean();
  if (!found) throw new HttpError(404, 'That employee no longer has an account.');

  const isSelf = String(found._id) === String(actor.id);
  const isOwner = can(actor, P.EMPLOYEES_MANAGE);

  if (!isSelf && !isOwner && !can(actor, P.ATTENDANCE_VIEW_ALL)) {
    throw new HttpError(403, 'You can only view your own profile.');
  }

  if (!isSelf && !isOwner) {
    return json({ user: toSafeUser(found), scope: 'directory' });
  }

  const [assignments, department] = await Promise.all([
    ShiftAssignment.find({ userId: found._id }).sort({ effectiveFrom: -1 }).lean(),
    found.departmentId ? Department.findById(found.departmentId).lean() : null,
  ]);

  return json({
    user: {
      ...toProfileUser(found),
      department: department?.name ?? found.department ?? null,
      // Never the plaintext: the Owner sees enough to confirm the right record.
      nationalIdMasked: isOwner ? maskStoredField(found.nationalId) : null,
      hasNationalId: Boolean(found.nationalId),
    },
    assignments: assignments.map((a) => ({
      id: String(a._id),
      shiftId: String(a.shiftId),
      effectiveFrom: a.effectiveFrom,
      effectiveTo: a.effectiveTo ?? null,
    })),
    scope: isOwner ? 'owner' : 'self',
    canEdit: isOwner && canManageAccount(actor, { role: found.role, id: String(found._id) }),
  });
});

const UpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  requiresAttendance: z.boolean().optional(),

  designation: z.string().trim().max(80).nullish(),
  departmentId: objectId.nullish(),
  managerId: objectId.nullish(),
  office: z.enum(OFFICES).optional(),
  workMode: z.enum(WORK_MODES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  joiningDate: dateString.nullish(),
  probationEnd: dateString.nullish(),
  confirmationDate: dateString.nullish(),
  exitDate: dateString.nullish(),
  exitType: z.enum(EXIT_TYPES).nullish(),
  shiftId: objectId.nullish(),
  shiftEffectiveFrom: dateString.nullish(),

  phone: z.string().trim().max(40).nullish(),
  personalEmail: z.string().trim().toLowerCase().email().nullish().or(z.literal('')),
  dateOfBirth: dateString.nullish(),
  address: z.string().trim().max(400).nullish(),
  emergencyContact: z
    .object({
      name: z.string().trim().max(80).nullish(),
      relation: z.string().trim().max(40).nullish(),
      phone: z.string().trim().max(40).nullish(),
    })
    .optional(),
  nationalId: z.string().trim().max(40).nullish(),
  photo: asset.nullish(),
});

/**
 * Update a profile (Owner only).
 *
 * A role change invalidates every live session for that account by bumping
 * tokenVersion, so a demoted user cannot keep using a page they already had
 * open with their old permissions.
 */
export const PATCH = api(async (req, context) => {
  const actor = await requireApiUser();
  if (!can(actor, P.EMPLOYEES_MANAGE)) {
    throw new HttpError(403, 'Only the Owner can edit employee profiles.');
  }
  const { id } = await params(context);
  const data = parseBody(UpdateSchema, await readJson(req));

  await connectDB();
  const target = await User.findById(id).lean();
  if (!target) throw new HttpError(404, 'That employee no longer has an account.');

  if (!canManageAccount(actor, { role: target.role, id: String(target._id) })) {
    throw new HttpError(
      403,
      'Owner accounts cannot be changed from the portal. Use scripts/create-owner.mjs instead.'
    );
  }
  if (data.role && !canAssignRole(actor, data.role)) {
    throw new HttpError(403, "You can't assign this role.");
  }

  const set = {};
  const assign = (key, value) => {
    if (value !== undefined) set[key] = value;
  };

  assign('name', data.name);
  assign('email', data.email);
  assign('requiresAttendance', data.requiresAttendance);
  assign('designation', data.designation);
  assign('managerId', data.managerId);
  assign('workMode', data.workMode);
  assign('employmentType', data.employmentType);
  assign('phone', data.phone);
  assign('address', data.address);
  assign('emergencyContact', data.emergencyContact);
  assign('photo', data.photo);
  if (data.personalEmail !== undefined) set.personalEmail = data.personalEmail || null;

  for (const key of [
    'joiningDate',
    'probationEnd',
    'confirmationDate',
    'dateOfBirth',
    'exitDate',
  ]) {
    if (data[key] !== undefined) set[key] = data[key] ? new Date(data[key]) : null;
  }
  if (data.exitType !== undefined) set.exitType = data.exitType ?? null;

  if (data.office) set.office = data.office;

  if (data.departmentId !== undefined) {
    set.departmentId = data.departmentId ?? null;
    const department = data.departmentId
      ? await Department.findById(data.departmentId).lean()
      : null;
    set.department = department?.name ?? null;
  }

  if (data.nationalId !== undefined) {
    set.nationalId = data.nationalId ? encryptField(data.nationalId) : null;
  }

  // A role change must sign the account out everywhere.
  const roleChanged = data.role && data.role !== target.role;
  if (roleChanged) set.role = data.role;

  const update = { $set: set };
  if (roleChanged) update.$inc = { tokenVersion: 1 };

  try {
    await User.updateOne({ _id: target._id }, update, { runValidators: true });
  } catch (e) {
    if (e?.code === 11000) throw new HttpError(409, 'That email is already in use.');
    throw e;
  }

  // A new shift is a new dated assignment, so history stays intact.
  if (data.shiftId !== undefined && String(data.shiftId ?? '') !== String(target.shiftId ?? '')) {
    const effectiveFrom = data.shiftEffectiveFrom ? new Date(data.shiftEffectiveFrom) : new Date();
    await ShiftAssignment.updateMany(
      { userId: target._id, effectiveTo: null },
      { $set: { effectiveTo: new Date(effectiveFrom.getTime() - 86400000) } }
    );
    if (data.shiftId) {
      await ShiftAssignment.create({
        userId: target._id,
        shiftId: data.shiftId,
        effectiveFrom,
        createdBy: actor.id,
      });
    }
    await User.updateOne({ _id: target._id }, { $set: { shiftId: data.shiftId ?? null } });
  }

  const after = await User.findById(target._id).lean();

  await logAudit({
    actorId: actor.id,
    action: roleChanged ? 'employee.role_change' : 'employee.update',
    targetType: 'user',
    targetId: String(target._id),
    before: toSafeUser(target),
    after: toSafeUser(after),
    meta: roleChanged ? { from: target.role, to: data.role } : null,
    req,
  });

  return json({ user: toProfileUser(after), signedOut: Boolean(roleChanged) });
});
