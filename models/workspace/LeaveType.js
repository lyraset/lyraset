import mongoose from 'mongoose';
import { OFFICES } from './User.js';

/**
 * A kind of leave the Owner offers. Retired by clearing `active` so historical
 * requests keep pointing at something real.
 *
 * `paid` and `countsTowardQuota` are separate on purpose: a paid type that does
 * not consume the monthly quota (say, bereavement) is a normal thing to want.
 */
const WorkspaceLeaveTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 8, unique: true },
    color: { type: String, default: '#3d7bff', match: /^#[0-9a-fA-F]{6}$/ },

    paid: { type: Boolean, default: true },
    countsTowardQuota: { type: Boolean, default: true },
    monthlyLimit: { type: Number, default: null, min: 0, max: 31 },
    allowHalfDay: { type: Boolean, default: true },

    requiresDocument: { type: Boolean, default: false },
    /** Only ask for the document past this many days. 0 means always. */
    documentAfterDays: { type: Number, default: 0, min: 0, max: 60 },
    minNoticeDays: { type: Number, default: 0, min: 0, max: 90 },

    /** Empty means every office. */
    offices: { type: [String], enum: OFFICES, default: [] },
    active: { type: Boolean, default: true },
    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_leave_types' }
);

WorkspaceLeaveTypeSchema.index({ active: 1, name: 1 });

export default mongoose.models.WorkspaceLeaveType ||
  mongoose.model('WorkspaceLeaveType', WorkspaceLeaveTypeSchema);
