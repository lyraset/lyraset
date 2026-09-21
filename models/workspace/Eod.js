import mongoose from 'mongoose';
import { OFFICES } from './User.js';

const { ObjectId } = mongoose.Schema.Types;

export const TASK_STATUSES = Object.freeze(['COMPLETED', 'IN_PROGRESS', 'BLOCKED']);

/**
 * The end-of-day report. Required to clock out: the EOD and the clock-out are
 * written together in one transaction, so a day can never end with hours
 * logged and no record of what was done in them.
 *
 * Edits keep the previous text in `versions[]` rather than overwriting it, so
 * a report that changed after the fact is visible as such.
 */

const AttachmentSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true },
    resourceType: { type: String, default: 'image' },
    format: { type: String, default: null },
    filename: { type: String, default: null },
    bytes: { type: Number, default: null },
  },
  { _id: false }
);

const TaskSchema = new mongoose.Schema(
  {
    projectId: { type: ObjectId, ref: 'WorkspaceProject', default: null },
    /** Kept alongside the id so exports survive a project being renamed. */
    projectName: { type: String, trim: true, maxlength: 120, default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    minutes: { type: Number, default: null, min: 0, max: 1440 },
    status: { type: String, enum: TASK_STATUSES, default: 'COMPLETED' },
  },
  { _id: false }
);

const VersionSchema = new mongoose.Schema(
  {
    tasks: { type: [TaskSchema], default: [] },
    blockers: { type: String, default: null },
    tomorrowPlan: { type: String, default: null },
    editedAt: { type: Date, default: Date.now },
    editedBy: { type: ObjectId, ref: 'WorkspaceUser', default: null },
  },
  { _id: false }
);

const WorkspaceEodSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'WorkspaceUser', required: true },
    attendanceId: { type: ObjectId, ref: 'WorkspaceAttendance', default: null },
    workDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    cycleKey: { type: String, default: null },
    office: { type: String, enum: OFFICES, default: 'ISLAMABAD' },

    tasks: { type: [TaskSchema], required: true },
    blockers: { type: String, trim: true, maxlength: 4000, default: null },
    tomorrowPlan: { type: String, trim: true, maxlength: 4000, default: null },
    links: { type: [String], default: [] },
    attachments: { type: [AttachmentSchema], default: [] },

    submittedAt: { type: Date, default: Date.now },
    /** Submitted after the day was auto-closed, rather than at clock-out. */
    lateSubmission: { type: Boolean, default: false },
    versions: { type: [VersionSchema], default: [] },

    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_eods' }
);

WorkspaceEodSchema.index({ userId: 1, workDate: 1 }, { unique: true });
WorkspaceEodSchema.index({ workDate: -1, office: 1 });
WorkspaceEodSchema.index({ cycleKey: 1 });
WorkspaceEodSchema.index({ 'tasks.projectId': 1, workDate: -1 });
WorkspaceEodSchema.index({ createdAt: -1 });

/** Total minutes the employee accounted for across their tasks. */
export function reportedMinutes(eod) {
  return (eod?.tasks ?? []).reduce((sum, t) => sum + (Number(t.minutes) || 0), 0);
}

export default mongoose.models.WorkspaceEod || mongoose.model('WorkspaceEod', WorkspaceEodSchema);
