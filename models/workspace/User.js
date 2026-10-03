import mongoose from 'mongoose';
import { ROLES } from '../../lib/workspace/permissions.js';

/** The one office, in Pakistan. Every time in the portal is Pakistan time (lib/workspace/timezone.js). */
export const OFFICES = Object.freeze(['ISLAMABAD']);
export const WORK_MODES = Object.freeze(['OFFICE', 'HYBRID', 'REMOTE']);
export const EMPLOYMENT_TYPES = Object.freeze(['PERMANENT', 'PROBATION', 'CONTRACT', 'INTERN']);
export const USER_STATUS = Object.freeze(['ACTIVE', 'INACTIVE']);
export const EXIT_TYPES = Object.freeze(['RESIGNED', 'TERMINATED', 'CONTRACT_ENDED']);
export const DOCUMENT_TYPES = Object.freeze([
  'CV',
  'OFFER_LETTER',
  'CONTRACT',
  'ID_COPY',
  'DEGREE',
  'OTHER',
]);

const { ObjectId } = mongoose.Schema.Types;

/** A private Cloudinary asset. Delivery is always through a short-lived signed URL. */
const AssetSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true },
    resourceType: { type: String, default: 'image' },
    format: { type: String, default: null },
    filename: { type: String, default: null },
    bytes: { type: Number, default: null },
  },
  { _id: false }
);

const DocumentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: DOCUMENT_TYPES, default: 'OTHER' },
    label: { type: String, trim: true, maxlength: 120 },
    asset: { type: AssetSchema, required: true },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: ObjectId, ref: 'WorkspaceUser', default: null },
  },
  { _id: true }
);

const WorkspaceUserSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },

    role: { type: String, enum: Object.values(ROLES), required: true, default: ROLES.EMPLOYEE },
    requiresAttendance: { type: Boolean, default: true },

    // ---- Personal (Owner and the person themselves only) ----
    photo: { type: AssetSchema, default: null },
    dateOfBirth: { type: Date, default: null },
    phone: { type: String, trim: true, maxlength: 40, default: null },
    personalEmail: { type: String, trim: true, lowercase: true, maxlength: 120, default: null },
    address: { type: String, trim: true, maxlength: 400, default: null },
    emergencyContact: {
      name: { type: String, trim: true, maxlength: 80, default: null },
      relation: { type: String, trim: true, maxlength: 40, default: null },
      phone: { type: String, trim: true, maxlength: 40, default: null },
    },
    /** AES-256-GCM ciphertext. Never selected by default, never sent to the browser in the clear. */
    nationalId: { type: String, default: null, select: false },

    // ---- Employment (directory level) ----
    designation: { type: String, trim: true, maxlength: 80 },
    department: { type: String, trim: true, maxlength: 80 },
    departmentId: { type: ObjectId, ref: 'WorkspaceDepartment', default: null },
    managerId: { type: ObjectId, ref: 'WorkspaceUser', default: null },
    office: { type: String, enum: OFFICES, default: 'ISLAMABAD' },
    workMode: { type: String, enum: WORK_MODES, default: 'OFFICE' },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, default: 'PROBATION' },
    joiningDate: { type: Date },
    shiftId: { type: ObjectId, ref: 'WorkspaceShift', default: null },
    status: { type: String, enum: USER_STATUS, default: 'ACTIVE' },

    // ---- Employment status dates ----
    probationEnd: { type: Date, default: null },
    confirmationDate: { type: Date, default: null },
    exitDate: { type: Date, default: null },
    exitType: { type: String, enum: [...EXIT_TYPES, null], default: null },

    // ---- HR documents (Owner only) ----
    documents: { type: [DocumentSchema], default: [] },

    // ---- Consent to monitoring (location and IP at clock-in) ----
    consentAcknowledgedAt: { type: Date, default: null },

    // ---- Security ----
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
    tokenVersion: { type: Number, default: 0 }, // bump to invalidate all sessions
    lastLoginAt: { type: Date, default: null },

    createdBy: { type: ObjectId, ref: 'WorkspaceUser', default: null },
    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_users' }
);

// Exactly one Owner, enforced by the database itself.
WorkspaceUserSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: ROLES.OWNER }, name: 'single_owner' }
);
WorkspaceUserSchema.index({ status: 1, name: 1 });
WorkspaceUserSchema.index({ office: 1, status: 1 });
WorkspaceUserSchema.index({ departmentId: 1 });
WorkspaceUserSchema.index({ requiresAttendance: 1, status: 1 });
WorkspaceUserSchema.index({ probationEnd: 1 });

// The CEO is always exempt from attendance, whatever the form sends.
WorkspaceUserSchema.pre('validate', function () {
  if (this.role === ROLES.CEO) this.requiresAttendance = false;
});

/**
 * Directory-level fields: what the MD and CEO may see about anyone, and what
 * every list, board and export is built from. Never includes the password
 * hash, lock state, personal contact details or documents.
 */
export function toSafeUser(user) {
  if (!user) return null;
  const u = typeof user.toObject === 'function' ? user.toObject() : user;
  return {
    id: String(u._id),
    employeeId: u.employeeId,
    name: u.name,
    email: u.email,
    role: u.role,
    requiresAttendance: u.requiresAttendance !== false,
    designation: u.designation ?? null,
    department: u.department ?? null,
    departmentId: u.departmentId ? String(u.departmentId) : null,
    managerId: u.managerId ? String(u.managerId) : null,
    office: u.office,
    workMode: u.workMode,
    employmentType: u.employmentType,
    joiningDate: u.joiningDate ?? null,
    shiftId: u.shiftId ? String(u.shiftId) : null,
    status: u.status,
    photoPublicId: u.photo?.publicId ?? null,
    consentAcknowledgedAt: u.consentAcknowledgedAt ?? null,
    lastLoginAt: u.lastLoginAt ?? null,
  };
}

/**
 * Everything on the HR profile, for the Owner and for the person themselves.
 * `nationalId` is deliberately absent: it is served masked, on request, by the
 * profile route, so it never rides along in a list response.
 */
export function toProfileUser(user) {
  if (!user) return null;
  const u = typeof user.toObject === 'function' ? user.toObject() : user;
  return {
    ...toSafeUser(u),
    photo: u.photo ?? null,
    dateOfBirth: u.dateOfBirth ?? null,
    phone: u.phone ?? null,
    personalEmail: u.personalEmail ?? null,
    address: u.address ?? null,
    emergencyContact: {
      name: u.emergencyContact?.name ?? null,
      relation: u.emergencyContact?.relation ?? null,
      phone: u.emergencyContact?.phone ?? null,
    },
    probationEnd: u.probationEnd ?? null,
    confirmationDate: u.confirmationDate ?? null,
    exitDate: u.exitDate ?? null,
    exitType: u.exitType ?? null,
    documents: (u.documents ?? []).map((d) => ({
      id: String(d._id),
      type: d.type,
      label: d.label ?? null,
      filename: d.asset?.filename ?? null,
      publicId: d.asset?.publicId ?? null,
      resourceType: d.asset?.resourceType ?? 'image',
      bytes: d.asset?.bytes ?? null,
      uploadedAt: d.uploadedAt ?? null,
    })),
    createdAt: u.createdAt ?? null,
    updatedAt: u.updatedAt ?? null,
  };
}

export default mongoose.models.WorkspaceUser ||
  mongoose.model('WorkspaceUser', WorkspaceUserSchema);
