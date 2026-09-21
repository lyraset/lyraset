import mongoose from 'mongoose';
import { OFFICES } from './User.js';

/**
 * The public holiday calendar, per office.
 *
 * Moon-dependent dates such as Eid move at short notice, so holidays are added
 * and edited freely; adding one recalculates the affected days in any open
 * period. `isClosure` marks a one-off office closure, which behaves as a
 * holiday but reads differently in reports.
 */
const WorkspaceHolidaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    /** Empty means every office. */
    offices: { type: [String], enum: OFFICES, default: [] },
    isClosure: { type: Boolean, default: false },
    note: { type: String, trim: true, maxlength: 400, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceUser', default: null },
    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_holidays' }
);

WorkspaceHolidaySchema.index({ date: 1 });
WorkspaceHolidaySchema.index({ date: 1, name: 1 }, { unique: true });

export default mongoose.models.WorkspaceHoliday ||
  mongoose.model('WorkspaceHoliday', WorkspaceHolidaySchema);
