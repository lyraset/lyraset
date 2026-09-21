import mongoose from 'mongoose';
import { OFFICES } from './User.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

export const REQUEST_TYPES = Object.freeze(['CORRECTION', 'WFH', 'OFFICIAL_DUTY', 'OVERTIME']);
export const REQUEST_STATUSES = Object.freeze(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);

const EvidenceSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true },
    resourceType: { type: String, default: 'image' },
    format: { type: String, default: null },
    filename: { type: String, default: null },
  },
  { _id: false }
);

/**
 * Everything that is not a leave application: attendance corrections, work
 * from home, official duty and overtime claims. They share one shape because
 * they share one inbox and one approval rule (nobody approves their own).
 *
 * `payload` is type-specific and validated by a per-type zod schema in the API
 * layer, never trusted as it arrives.
 */
const WorkspaceRequestSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'WorkspaceUser', required: true },
    type: { type: String, enum: REQUEST_TYPES, required: true },
    office: { type: String, enum: OFFICES, default: 'ISLAMABAD' },

    /** Work dates the request covers — denormalised so day views can look it up cheaply. */
    dates: { type: [String], default: [] },
    payload: { type: Mixed, default: {} },

    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    evidence: { type: EvidenceSchema, default: null },

    status: { type: String, enum: REQUEST_STATUSES, default: 'PENDING' },
    reviewedBy: { type: ObjectId, ref: 'WorkspaceUser', default: null },
    reviewedAt: { type: Date, default: null },
    reviewComment: { type: String, trim: true, maxlength: 1000, default: null },

    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_requests' }
);

WorkspaceRequestSchema.index({ userId: 1, createdAt: -1 });
WorkspaceRequestSchema.index({ status: 1, type: 1, createdAt: -1 });
WorkspaceRequestSchema.index({ dates: 1, type: 1, status: 1 });

export default mongoose.models.WorkspaceRequest ||
  mongoose.model('WorkspaceRequest', WorkspaceRequestSchema);
