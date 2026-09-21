import mongoose from 'mongoose';
import { OFFICES } from './User.js';

const { ObjectId } = mongoose.Schema.Types;

/**
 * One company month for one office, and whether it is still editable.
 *
 * The period stores its own start and end dates rather than recomputing them,
 * so a later change to the company month start day cannot silently move the
 * boundaries of a cycle that has already been reviewed and locked.
 *
 * A LOCKED period is read-only to everyone, the Owner included, until it is
 * explicitly unlocked with a reason.
 */

const UnlockSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: ObjectId, ref: 'WorkspaceUser', default: null },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const WorkspacePayrollPeriodSchema = new mongoose.Schema(
  {
    office: { type: String, enum: OFFICES, required: true },
    cycleKey: { type: String, required: true },
    cycleLabel: { type: String, default: null },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    status: { type: String, enum: ['OPEN', 'LOCKED'], default: 'OPEN' },
    lockedBy: { type: ObjectId, ref: 'WorkspaceUser', default: null },
    lockedAt: { type: Date, default: null },
    unlockHistory: { type: [UnlockSchema], default: [] },

    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_payroll_periods' }
);

WorkspacePayrollPeriodSchema.index({ office: 1, cycleKey: 1 }, { unique: true });
WorkspacePayrollPeriodSchema.index({ status: 1, startDate: -1 });

export default mongoose.models.WorkspacePayrollPeriod ||
  mongoose.model('WorkspacePayrollPeriod', WorkspacePayrollPeriodSchema);
