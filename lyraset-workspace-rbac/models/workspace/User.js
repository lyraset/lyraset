import mongoose from "mongoose";
import { ROLES } from "../../lib/workspace/permissions.js";

export const OFFICES = Object.freeze(["ISLAMABAD", "DUBAI"]);
export const OFFICE_TIMEZONES = Object.freeze({ ISLAMABAD: "Asia/Karachi", DUBAI: "Asia/Dubai" });
export const WORK_MODES = Object.freeze(["OFFICE", "HYBRID", "REMOTE"]);
export const EMPLOYMENT_TYPES = Object.freeze(["PERMANENT", "PROBATION", "CONTRACT", "INTERN"]);
export const USER_STATUS = Object.freeze(["ACTIVE", "INACTIVE"]);

const { ObjectId } = mongoose.Schema.Types;

const WorkspaceUserSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },

    role: { type: String, enum: Object.values(ROLES), required: true, default: ROLES.EMPLOYEE },
    requiresAttendance: { type: Boolean, default: true },

    designation: { type: String, trim: true, maxlength: 80 },
    department: { type: String, trim: true, maxlength: 80 },
    office: { type: String, enum: OFFICES, default: "ISLAMABAD" },
    timezone: { type: String, default: "Asia/Karachi" },
    workMode: { type: String, enum: WORK_MODES, default: "OFFICE" },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, default: "PROBATION" },
    joiningDate: { type: Date },
    shiftId: { type: ObjectId, ref: "WorkspaceShift", default: null },
    status: { type: String, enum: USER_STATUS, default: "ACTIVE" },

    // Security
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
    tokenVersion: { type: Number, default: 0 }, // bump to invalidate all sessions
    lastLoginAt: { type: Date, default: null },

    createdBy: { type: ObjectId, ref: "WorkspaceUser", default: null },
    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "workspace_users" }
);

// Exactly one Owner, enforced by the database itself.
WorkspaceUserSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: ROLES.OWNER }, name: "single_owner" }
);

// The CEO is always exempt from attendance, whatever the form sends.
WorkspaceUserSchema.pre("validate", function () {
  if (this.role === ROLES.CEO) this.requiresAttendance = false;
});

/** Fields safe to send to the browser. Never includes hash, lock or token data. */
export function toSafeUser(user) {
  if (!user) return null;
  const u = typeof user.toObject === "function" ? user.toObject() : user;
  return {
    id: String(u._id),
    employeeId: u.employeeId,
    name: u.name,
    email: u.email,
    role: u.role,
    requiresAttendance: u.requiresAttendance !== false,
    designation: u.designation ?? null,
    department: u.department ?? null,
    office: u.office,
    timezone: u.timezone,
    workMode: u.workMode,
    employmentType: u.employmentType,
    joiningDate: u.joiningDate ?? null,
    status: u.status,
    lastLoginAt: u.lastLoginAt ?? null,
  };
}

export default mongoose.models.WorkspaceUser ||
  mongoose.model("WorkspaceUser", WorkspaceUserSchema);
