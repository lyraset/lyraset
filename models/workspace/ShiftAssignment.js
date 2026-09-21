import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Which shift an employee was on, and when.
 *
 * Assignments are dated rather than edited in place, so moving someone from the
 * day shift to nights on the 1st never changes what their September days
 * required. An open-ended assignment has `effectiveTo: null`.
 */
const WorkspaceShiftAssignmentSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'WorkspaceUser', required: true },
    shiftId: { type: ObjectId, ref: 'WorkspaceShift', required: true },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },
    note: { type: String, trim: true, maxlength: 200, default: null },
    createdBy: { type: ObjectId, ref: 'WorkspaceUser', default: null },
    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_shift_assignments' }
);

WorkspaceShiftAssignmentSchema.index({ userId: 1, effectiveFrom: -1 });
WorkspaceShiftAssignmentSchema.index({ shiftId: 1 });

export default mongoose.models.WorkspaceShiftAssignment ||
  mongoose.model('WorkspaceShiftAssignment', WorkspaceShiftAssignmentSchema);
