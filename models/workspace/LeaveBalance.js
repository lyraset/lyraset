import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * One row per employee per company month.
 *
 * `pending` holds days locked by requests awaiting a decision, so two requests
 * submitted the same morning cannot both be told the quota is free. Approval
 * moves days from `pending` to `used`; rejection or cancellation releases them.
 */
const WorkspaceLeaveBalanceSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'WorkspaceUser', required: true },
    cycleKey: { type: String, required: true }, // 'YYYY-MM' of the cycle end
    cycleStart: { type: Date, required: true },
    cycleEnd: { type: Date, required: true },

    quota: { type: Number, default: 0, min: 0 },
    carriedIn: { type: Number, default: 0, min: 0 },
    used: { type: Number, default: 0, min: 0 },
    pending: { type: Number, default: 0, min: 0 },
    /** Written by the rollover job when the cycle closes. */
    carriedOut: { type: Number, default: 0, min: 0 },
    rolledOverAt: { type: Date, default: null },

    /** Days used per leave type this cycle, keyed by leave type id. */
    usedByType: { type: Map, of: Number, default: () => new Map() },

    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_leave_balances' }
);

WorkspaceLeaveBalanceSchema.index({ userId: 1, cycleKey: 1 }, { unique: true });
WorkspaceLeaveBalanceSchema.index({ cycleKey: 1 });

export default mongoose.models.WorkspaceLeaveBalance ||
  mongoose.model('WorkspaceLeaveBalance', WorkspaceLeaveBalanceSchema);
