import mongoose from 'mongoose';
import { OFFICES } from './User.js';

const { ObjectId } = mongoose.Schema.Types;

export const LEAVE_STATUSES = Object.freeze([
  'PENDING',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED',
  'CANCELLED',
  'CANCEL_PENDING',
]);

const AttachmentSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true },
    resourceType: { type: String, default: 'image' },
    format: { type: String, default: null },
    filename: { type: String, default: null },
  },
  { _id: false }
);

/** How a request is charged against one company month. */
const CycleSplitSchema = new mongoose.Schema(
  {
    cycleKey: { type: String, required: true },
    cycleStart: { type: Date, required: true },
    cycleEnd: { type: Date, required: true },
    days: { type: Number, default: 0 },
    paidDays: { type: Number, default: 0 },
    unpaidDays: { type: Number, default: 0 },
    dates: { type: [String], default: [] },
  },
  { _id: false }
);

const WorkspaceLeaveRequestSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'WorkspaceUser', required: true },
    leaveTypeId: { type: ObjectId, ref: 'WorkspaceLeaveType', required: true },
    office: { type: String, enum: OFFICES, default: 'ISLAMABAD' },

    from: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    to: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    halfDay: { type: Boolean, default: false },
    /** A few approved hours inside one day, rather than a half or full day. */
    hours: { type: Number, default: null, min: 0.5, max: 8 },

    days: { type: Number, default: 0 },
    paidDays: { type: Number, default: 0 },
    unpaidDays: { type: Number, default: 0 },
    /** Every date the request actually charges, after weekends and the sandwich rule. */
    countedDates: { type: [String], default: [] },
    /** The subset an approver granted; equals countedDates for a full approval. */
    approvedDates: { type: [String], default: [] },
    cycleSplits: { type: [CycleSplitSchema], default: [] },

    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    attachment: { type: AttachmentSchema, default: null },

    status: { type: String, enum: LEAVE_STATUSES, default: 'PENDING' },
    reviewedBy: { type: ObjectId, ref: 'WorkspaceUser', default: null },
    reviewedAt: { type: Date, default: null },
    reviewComment: { type: String, trim: true, maxlength: 1000, default: null },
    cancelReason: { type: String, trim: true, maxlength: 500, default: null },

    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_leave_requests' }
);

WorkspaceLeaveRequestSchema.index({ userId: 1, from: -1 });
WorkspaceLeaveRequestSchema.index({ status: 1, createdAt: -1 });
WorkspaceLeaveRequestSchema.index({ from: 1, to: 1, status: 1 });
WorkspaceLeaveRequestSchema.index({ 'cycleSplits.cycleKey': 1 });
WorkspaceLeaveRequestSchema.index({ countedDates: 1, status: 1 });

export default mongoose.models.WorkspaceLeaveRequest ||
  mongoose.model('WorkspaceLeaveRequest', WorkspaceLeaveRequestSchema);
