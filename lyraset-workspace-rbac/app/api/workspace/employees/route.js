import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/workspace/db";
import User, {
  toSafeUser,
  OFFICES,
  OFFICE_TIMEZONES,
  WORK_MODES,
  EMPLOYMENT_TYPES,
} from "@/models/workspace/User";
import { P, ROLES, ASSIGNABLE_ROLES, canAssignRole } from "@/lib/workspace/permissions";
import { requireApiPermission, handleApiError, HttpError } from "@/lib/workspace/auth";
import { hashPassword, generatePassword, PASSWORD_MIN_LENGTH } from "@/lib/workspace/passwords";
import { logAudit } from "@/lib/workspace/audit";

// GET — directory of everyone (MD, Owner, CEO)
export async function GET() {
  try {
    await requireApiPermission(P.ATTENDANCE_VIEW_ALL);
    await connectDB();
    const users = await User.find({}).sort({ status: 1, name: 1 }).lean();
    return NextResponse.json({ users: users.map(toSafeUser) });
  } catch (err) {
    return handleApiError(err);
  }
}

const CreateSchema = z.object({
  employeeId: z.string().trim().regex(/^[A-Za-z0-9-]{3,20}$/, "3–20 letters, numbers or dashes"),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ASSIGNABLE_ROLES),
  requiresAttendance: z.boolean().optional(),
  designation: z.string().trim().max(80).optional(),
  department: z.string().trim().max(80).optional(),
  office: z.enum(OFFICES).default("ISLAMABAD"),
  workMode: z.enum(WORK_MODES).default("OFFICE"),
  employmentType: z.enum(EMPLOYMENT_TYPES).default("PROBATION"),
  joiningDate: z.coerce.date().optional(),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(128).optional(), // omit to auto-generate
});

// POST — create an account (Owner only)
export async function POST(req) {
  try {
    const actor = await requireApiPermission(P.EMPLOYEES_MANAGE);

    const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Some fields need fixing.",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400 }
      );
    }
    const data = parsed.data;
    if (!canAssignRole(actor, data.role)) throw new HttpError(403, "You can't assign this role.");

    const generatedPassword = data.password ? null : generatePassword();
    await connectDB();

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
        department: data.department,
        office: data.office,
        timezone: OFFICE_TIMEZONES[data.office],
        workMode: data.workMode,
        employmentType: data.employmentType,
        joiningDate: data.joiningDate,
        createdBy: actor.id,
      });
    } catch (e) {
      if (e?.code === 11000) throw new HttpError(409, "That Employee ID or email is already in use.");
      throw e;
    }

    const safe = toSafeUser(created);
    await logAudit({
      actorId: actor.id,
      action: "employee.create",
      targetType: "user",
      targetId: safe.id,
      after: safe,
      req,
    });

    // The generated password is returned once and never stored in plain text.
    return NextResponse.json(
      { user: safe, ...(generatedPassword && { generatedPassword }) },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
