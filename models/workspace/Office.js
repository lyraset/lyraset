import mongoose from 'mongoose';
import { OFFICES } from './User.js';

/**
 * The office, in Pakistan: its weekend and the integrity checks applied at
 * clock-in. There is no timezone here — the whole portal runs on Pakistan
 * time (lib/workspace/timezone.js).
 */

const WorkspaceOfficeSchema = new mongoose.Schema(
  {
    code: { type: String, enum: OFFICES, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    /** Luxon weekday numbers: 1 Monday to 7 Sunday. */
    weekendDays: { type: [Number], default: [7] },

    // ---- Integrity checks at clock-in (skipped for REMOTE staff, still logged) ----
    enforceIpAllowlist: { type: Boolean, default: false },
    ipAllowlist: { type: [String], default: [] }, // CIDR ranges
    enforceGeofence: { type: Boolean, default: false },
    geofence: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      radiusM: { type: Number, default: 200, min: 20, max: 20000 },
    },
    policyNote: { type: String, trim: true, maxlength: 2000, default: null },
    active: { type: Boolean, default: true },
    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_offices' }
);

export default mongoose.models.WorkspaceOffice ||
  mongoose.model('WorkspaceOffice', WorkspaceOfficeSchema);
