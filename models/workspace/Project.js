import mongoose from 'mongoose';

/**
 * Clients and projects EOD tasks are filed against. Reporting "everything we
 * did for one client this cycle" is the whole point of tagging tasks, so the
 * list is Owner-managed rather than free text.
 */
const WorkspaceProjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    client: { type: String, trim: true, maxlength: 120, default: null },
    /** Marks the built-in "Internal / Other" row, which is always available. */
    isInternal: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_projects' }
);

WorkspaceProjectSchema.index({ name: 1, client: 1 }, { unique: true });
WorkspaceProjectSchema.index({ active: 1, name: 1 });

export default mongoose.models.WorkspaceProject ||
  mongoose.model('WorkspaceProject', WorkspaceProjectSchema);
