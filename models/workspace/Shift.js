import mongoose from 'mongoose';

/**
 * A shift is a weekly schedule, defined day by day. Times are local wall-clock
 * strings ('HH:mm') rather than instants, because "10:00" means 10:00 in the
 * employee's office whatever the date or the daylight-saving state.
 *
 * An end earlier than the start means the day runs past midnight; the
 * attendance record still belongs to the date the shift started.
 */

const DaySchema = new mongoose.Schema(
  {
    working: { type: Boolean, default: false },
    start: { type: String, default: null, match: /^\d{2}:\d{2}$/ },
    end: { type: String, default: null, match: /^\d{2}:\d{2}$/ },
    breakMinutes: { type: Number, default: 0, min: 0, max: 720 },
  },
  { _id: false }
);

const emptyDay = () => ({ working: false, start: null, end: null, breakMinutes: 0 });

const WorkspaceShiftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80, unique: true },
    days: {
      mon: { type: DaySchema, default: emptyDay },
      tue: { type: DaySchema, default: emptyDay },
      wed: { type: DaySchema, default: emptyDay },
      thu: { type: DaySchema, default: emptyDay },
      fri: { type: DaySchema, default: emptyDay },
      sat: { type: DaySchema, default: emptyDay },
      sun: { type: DaySchema, default: emptyDay },
    },
    graceMinutes: { type: Number, default: 15, min: 0, max: 240 },
    /** No fixed start time and no late marking — only the daily minutes count. */
    flexible: { type: Boolean, default: false },
    /** Used for anyone with no explicit assignment. */
    isDefault: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_shifts' }
);

WorkspaceShiftSchema.index({ active: 1, name: 1 });

export default mongoose.models.WorkspaceShift ||
  mongoose.model('WorkspaceShift', WorkspaceShiftSchema);
