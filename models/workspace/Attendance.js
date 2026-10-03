import mongoose from 'mongoose';
import { OFFICES } from './User.js';
import { STATUS } from '../../lib/workspace/calc/attendance.js';

const { ObjectId } = mongoose.Schema.Types;

export const BREAK_TYPES = Object.freeze(['LUNCH', 'PRAYER', 'OTHER']);
export const OVERTIME_CATEGORIES = Object.freeze(['WEEKDAY', 'WEEKEND', 'HOLIDAY']);

/**
 * One attendance record per person per work date.
 *
 * `workDate` is a plain 'YYYY-MM-DD' string in the employee's office timezone,
 * not a Date: it is a calendar label, and storing it as an instant would make
 * "which day was this?" depend on the reader's zone. Every timestamp beside it
 * is a real UTC instant stamped by the server.
 *
 * The unique index on (userId, workDate) is what makes a double-tapped clock-in
 * impossible to turn into two records.
 */

/** What was true about the device and network at a clock event. */
const ClockMetaSchema = new mongoose.Schema(
  {
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    accuracyM: { type: Number, default: null },
    distanceM: { type: Number, default: null },
    withinGeofence: { type: Boolean, default: null },
    withinIpAllowlist: { type: Boolean, default: null },
    /** Given when clocking in outside the geofence; goes to approvals. */
    reason: { type: String, trim: true, maxlength: 400, default: null },
  },
  { _id: false }
);

const BreakSchema = new mongoose.Schema(
  {
    type: { type: String, enum: BREAK_TYPES, default: 'OTHER' },
    start: { type: Date, required: true },
    end: { type: Date, default: null },
  },
  { _id: true }
);

const WorkspaceAttendanceSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'WorkspaceUser', required: true },
    workDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    /** Denormalised so reports and the payroll lock can filter without a join. */
    cycleKey: { type: String, default: null },
    office: { type: String, enum: OFFICES, default: 'ISLAMABAD' },

    clockIn: { type: Date, default: null },
    clockOut: { type: Date, default: null },
    breaks: { type: [BreakSchema], default: [] },

    workedMinutes: { type: Number, default: 0 },
    requiredMinutes: { type: Number, default: 0 },
    breakMinutes: { type: Number, default: 0 },
    lateByMinutes: { type: Number, default: 0 },
    earlyByMinutes: { type: Number, default: 0 },

    overtimeMinutes: { type: Number, default: 0 },
    overtimeApproved: { type: Boolean, default: false },
    overtimeApprovedMinutes: { type: Number, default: 0 },
    overtimeCategory: { type: String, enum: OVERTIME_CATEGORIES, default: 'WEEKDAY' },

    status: { type: String, enum: Object.values(STATUS), default: STATUS.NOT_MARKED },
    flags: { type: [String], default: [] },

    clockInMeta: { type: ClockMetaSchema, default: null },
    clockOutMeta: { type: ClockMetaSchema, default: null },

    autoClosed: { type: Boolean, default: false },
    eodMissing: { type: Boolean, default: false },
    eodId: { type: ObjectId, ref: 'WorkspaceEod', default: null },

    /** Clocked in away from the office without an approved official duty yet. */
    officialDutyPending: { type: Boolean, default: false },

    shiftId: { type: ObjectId, ref: 'WorkspaceShift', default: null },
    scheduleSource: { type: String, default: null },

    editedBy: { type: ObjectId, ref: 'WorkspaceUser', default: null },
    editedAt: { type: Date, default: null },
    editReason: { type: String, trim: true, maxlength: 400, default: null },

    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_attendance' }
);

// One record per person per day — the guard against double clock-ins.
WorkspaceAttendanceSchema.index({ userId: 1, workDate: 1 }, { unique: true });
WorkspaceAttendanceSchema.index({ workDate: 1, office: 1 });
WorkspaceAttendanceSchema.index({ workDate: 1, status: 1 });
WorkspaceAttendanceSchema.index({ userId: 1, cycleKey: 1 });
WorkspaceAttendanceSchema.index({ cycleKey: 1, office: 1 });
// Finding still-open sessions for the auto-close job.
WorkspaceAttendanceSchema.index({ clockOut: 1, clockIn: 1 });
WorkspaceAttendanceSchema.index({ officialDutyPending: 1 });
WorkspaceAttendanceSchema.index({ createdAt: -1 });

export default mongoose.models.WorkspaceAttendance ||
  mongoose.model('WorkspaceAttendance', WorkspaceAttendanceSchema);
