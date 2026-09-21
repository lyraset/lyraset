import mongoose from 'mongoose';
import { OFFICES } from './User.js';

/**
 * A date-range override of the normal weekly shift — Ramadan timings, a one-off
 * early close. It replaces the per-day times for its range and applies either
 * to every office (an empty `offices` list) or to the offices named.
 *
 * A day entry may be partial: giving only `end` shifts the close time and
 * leaves the start and break alone.
 */

const OverrideDaySchema = new mongoose.Schema(
  {
    working: { type: Boolean, default: undefined },
    start: { type: String, default: undefined, match: /^\d{2}:\d{2}$/ },
    end: { type: String, default: undefined, match: /^\d{2}:\d{2}$/ },
    breakMinutes: { type: Number, default: undefined, min: 0, max: 720 },
  },
  { _id: false, minimize: true }
);

const WorkspaceSpecialScheduleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    from: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    to: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    offices: { type: [String], enum: OFFICES, default: [] },
    days: {
      mon: { type: OverrideDaySchema, default: undefined },
      tue: { type: OverrideDaySchema, default: undefined },
      wed: { type: OverrideDaySchema, default: undefined },
      thu: { type: OverrideDaySchema, default: undefined },
      fri: { type: OverrideDaySchema, default: undefined },
      sat: { type: OverrideDaySchema, default: undefined },
      sun: { type: OverrideDaySchema, default: undefined },
    },
    graceMinutes: { type: Number, default: undefined, min: 0, max: 240 },
    flexible: { type: Boolean, default: undefined },
    note: { type: String, trim: true, maxlength: 400, default: null },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceUser', default: null },
    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_special_schedules' }
);

WorkspaceSpecialScheduleSchema.index({ active: 1, from: 1, to: 1 });

export default mongoose.models.WorkspaceSpecialSchedule ||
  mongoose.model('WorkspaceSpecialSchedule', WorkspaceSpecialScheduleSchema);
