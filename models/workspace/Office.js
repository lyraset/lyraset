import mongoose from 'mongoose';
import { OFFICES } from './User.js';

/**
 * One document per office. Holds the timezone every calculation for that
 * office runs in, plus the integrity checks applied at clock-in.
 *
 * Pakistan and the UAE differ on weekends, working-hour limits and leave
 * entitlements, so policy lives per office rather than company-wide. The
 * settings UI carries a note telling the Owner to confirm each with their
 * HR/legal advisor.
 */

const WorkspaceOfficeSchema = new mongoose.Schema(
  {
    code: { type: String, enum: OFFICES, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    timezone: { type: String, required: true, default: 'Asia/Karachi' },
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
    selfieRequired: { type: Boolean, default: false },

    policyNote: { type: String, trim: true, maxlength: 2000, default: null },
    active: { type: Boolean, default: true },
    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_offices' }
);

export default mongoose.models.WorkspaceOffice ||
  mongoose.model('WorkspaceOffice', WorkspaceOfficeSchema);
