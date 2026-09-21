import mongoose from 'mongoose';

/** The department list the Owner maintains. Retired by clearing `active`, never deleted. */
const WorkspaceDepartmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80, unique: true },
    active: { type: Boolean, default: true },
    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_departments' }
);

export default mongoose.models.WorkspaceDepartment ||
  mongoose.model('WorkspaceDepartment', WorkspaceDepartmentSchema);
