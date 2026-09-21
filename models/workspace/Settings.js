import mongoose from 'mongoose';

/**
 * Company-wide settings. A singleton: one document, found by `key`.
 *
 * The company month start day is kept as a history rather than a single value,
 * because changing it must not rewrite past cycles. Each entry records the day
 * and the date it takes effect; lib/workspace/calc/cycle.js turns that history
 * into the actual cycle boundaries.
 */

export const SINGLETON_KEY = 'COMPANY';
export const CARRY_FORWARD_MODES = Object.freeze(['LAPSE', 'CARRY']);
export const OVER_QUOTA_BEHAVIORS = Object.freeze(['BLOCK', 'CONVERT_TO_UNPAID']);

const CycleStartSchema = new mongoose.Schema(
  {
    day: { type: Number, min: 1, max: 28, required: true },
    effectiveFrom: { type: Date, required: true },
  },
  { _id: false }
);

const WorkspaceSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: SINGLETON_KEY, unique: true },

    // ---- Company month ----
    cycleStartHistory: {
      type: [CycleStartSchema],
      default: () => [{ day: 1, effectiveFrom: new Date('2020-01-01T00:00:00Z') }],
    },

    // ---- Leave ----
    monthlyLeaveQuota: { type: Number, default: 2, min: 0, max: 31 },
    leaveCarryForward: { type: String, enum: CARRY_FORWARD_MODES, default: 'LAPSE' },
    maxCarryForward: { type: Number, default: 0, min: 0, max: 31 },
    overQuotaBehavior: { type: String, enum: OVER_QUOTA_BEHAVIORS, default: 'CONVERT_TO_UNPAID' },
    sandwichRule: { type: Boolean, default: false },

    // ---- Attendance ----
    halfDayThresholdPercent: { type: Number, default: 50, min: 1, max: 100 },
    autoClockOutOffsetHours: { type: Number, default: 4, min: 1, max: 24 },
    paidBreaks: { type: Boolean, default: false },
    lateToDeduction: {
      lateCount: { type: Number, default: 3, min: 0, max: 31 },
      deductionDays: { type: Number, default: 0.5, min: 0, max: 5 },
    },

    // ---- EOD ----
    eodEditWindowHours: { type: Number, default: 12, min: 0, max: 168 },
    eodMinDescriptionLength: { type: Number, default: 20, min: 0, max: 2000 },

    // ---- Notification toggles ----
    notifications: {
      autoClockOutNotice: { type: Boolean, default: true },
      requestDecision: { type: Boolean, default: true },
      approverPending: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceUser', default: null },
    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_settings' }
);

/** The plain rules object the calc modules expect. */
export function toRules(settings) {
  return {
    halfDayThresholdPercent: settings?.halfDayThresholdPercent ?? 50,
    paidBreaks: settings?.paidBreaks ?? false,
    autoClockOutOffsetHours: settings?.autoClockOutOffsetHours ?? 4,
    lateToDeduction: {
      lateCount: settings?.lateToDeduction?.lateCount ?? 3,
      deductionDays: settings?.lateToDeduction?.deductionDays ?? 0.5,
    },
  };
}

/** The plain leave settings the leave calc expects. */
export function toLeaveSettings(settings) {
  return {
    monthlyLeaveQuota: settings?.monthlyLeaveQuota ?? 2,
    leaveCarryForward: settings?.leaveCarryForward ?? 'LAPSE',
    maxCarryForward: settings?.maxCarryForward ?? 0,
    overQuotaBehavior: settings?.overQuotaBehavior ?? 'CONVERT_TO_UNPAID',
    sandwichRule: settings?.sandwichRule ?? false,
  };
}

export default mongoose.models.WorkspaceSettings ||
  mongoose.model('WorkspaceSettings', WorkspaceSettingsSchema);
