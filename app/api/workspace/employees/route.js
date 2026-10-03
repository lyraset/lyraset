import { z } from 'zod';
import { connectDB } from '@/lib/workspace/db';
import User, { toSafeUser, OFFICES, WORK_MODES, EMPLOYMENT_TYPES } from '@/models/workspace/User';
import ShiftAssignment from '@/models/workspace/ShiftAssignment';
import Department from '@/models/workspace/Department';
import { P, ROLES, ASSIGNABLE_ROLES, canAssignRole } from '@/lib/workspace/permissions';
import { requireApiPermission, HttpError } from '@/lib/workspace/auth';
import { api, json, query, readJson } from '@/lib/workspace/route';
import {
  parseBody,
  parseQuery,
  objectId,
  dateString,
  asset,
  escapeRegex,
} from '@/lib/workspace/validation';
import { hashPassword, generatePassword, PASSWORD_MIN_LENGTH } from '@/lib/workspace/passwords';
import { encryptField } from '@/lib/workspace/crypto';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ListSchema = z.object({
  office: z.enum(OFFICES).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  departmentId: objectId.optional(),
  q: z.string().trim().max(80).optional(),
});

/** The directory. Visible to anyone who can see everyone's attendance. */
export const GET = api(async (req) => {
  await requireApiPermission(P.ATTENDANCE_VIEW_ALL);
  const filters = parseQuery(ListSchema, query(req));

  await connectDB();
  const find = {};
  if (filters.office) find.office = filters.office;
  if (filters.status) find.status = filters.status;
  if (filters.departmentId) find.departmentId = filters.departmentId;
  if (filters.q) {
    const safe = escapeRegex(filters.q);
    find.$or = [
      { name: { $regex: safe, $options: 'i' } },
      { employeeId: { $regex: safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } },
    ];
  }

  const [users, departments] = await Promise.all([
    User.find(find).sort({ status: 1, name: 1 }).lean(),
    Department.find({}).sort({ name: 1 }).lean(),
  ]);

  return json({
    users: users.map(toSafeUser),
    departments: departments.map((d) => ({ id: String(d._id), name: d.name, active: d.active })),
  });
});

const CreateSchema = z.object({
  employeeId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,20}$/, '3 to 20 letters, numbers or dashes'),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ASSIGNABLE_ROLES),
  requiresAttendance: z.boolean().optional(),

  designation: z.string().trim().max(80).optional(),
  departmentId: objectId.nullish(),
  managerId: objectId.nullish(),
  office: z.enum(OFFICES).default('ISLAMABAD'),
  workMode: z.enum(WORK_MODES).default('OFFICE'),
  employmentType: z.enum(EMPLOYMENT_TYPES).default('PROBATION'),
  joiningDate: dateString.optional(),
  probationEnd: dateString.nullish(),
  shiftId: objectId.nullish(),

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

  // Omit to have one generated and shown once.
  password: z.string().min(PASSWORD_MIN_LENGTH).max(128).optional(),
});

/**
 * Create an account (Owner only).
 *
 * There is no sign-up: the Owner enters everything, including the password.
 * A generated password is returned exactly once in this response and is never
 * recoverable afterwards, because only its bcrypt hash is stored.
 */
export const POST = api(async (req) => {
  const actor = await requireApiPermission(P.EMPLOYEES_MANAGE);
  const data = parseBody(CreateSchema, await readJson(req));

  if (!canAssignRole(actor, data.role)) throw new HttpError(403, "You can't assign this role.");

  const generatedPassword = data.password ? null : generatePassword();
  await connectDB();

  const department = data.departmentId ? await Department.findById(data.departmentId).lean() : null;

  let created;
  try {
    created = await User.create({
      employeeId: data.employeeId,
      name: data.name,
      email: data.email,
      passwordHash: await hashPassword(data.password ?? generatedPassword),
      role: data.role,
      requiresAttendance: data.requiresAttendance ?? data.role !== ROLES.CEO,
      designation: data.designation,
      department: department?.name ?? null,
      departmentId: data.departmentId ?? null,
      managerId: data.managerId ?? null,
      office: data.office,
      workMode: data.workMode,
      employmentType: data.employmentType,
      joiningDate: data.joiningDate ? new Date(data.joiningDate) : undefined,
      probationEnd: data.probationEnd ? new Date(data.probationEnd) : null,
      shiftId: data.shiftId ?? null,
      phone: data.phone ?? null,
      personalEmail: data.personalEmail || null,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      address: data.address ?? null,
      emergencyContact: data.emergencyContact ?? {},
      // Encrypted at rest; only the Owner ever sees it, and then only masked.
      nationalId: data.nationalId ? encryptField(data.nationalId) : null,
      photo: data.photo ?? null,
      createdBy: actor.id,
    });
  } catch (e) {
    if (e?.code === 11000) throw new HttpError(409, 'That Employee ID or email is already in use.');
    throw e;
  }

  // Dated assignment, so a later shift change never rewrites this person's history.
  if (data.shiftId) {
    await ShiftAssignment.create({
      userId: created._id,
      shiftId: data.shiftId,
      effectiveFrom: data.joiningDate ? new Date(data.joiningDate) : new Date(),
      createdBy: actor.id,
    });
  }

  const safe = toSafeUser(created);
  await logAudit({
    actorId: actor.id,
    action: 'employee.create',
    targetType: 'user',
    targetId: safe.id,
    after: safe,
    req,
  });

  return json({ user: safe, ...(generatedPassword && { generatedPassword }) }, 201);
});
