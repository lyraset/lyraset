import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

export const NOTIFICATION_TYPES = Object.freeze([
  'CLOCK_IN_REMINDER',
  'CLOCK_OUT_REMINDER',
  'AUTO_CLOCK_OUT',
  'REQUEST_DECISION',
  'LEAVE_DECISION',
  'APPROVAL_PENDING',
  'DAILY_SUMMARY',
  'PROBATION_ENDING',
  'ACCOUNT',
]);

/**
 * In-app notifications, shown under the bell with an unread count. Email is
 * sent alongside where the Owner has enabled it; this collection is the record
 * either way, so nothing is lost when email is off or fails.
 *
 * `dedupeKey` lets a job that reruns (crons are idempotent by design) avoid
 * sending the same reminder twice.
 */
const WorkspaceNotificationSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'WorkspaceUser', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    message: { type: String, trim: true, maxlength: 600, default: null },
    link: { type: String, trim: true, maxlength: 300, default: null },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    emailedAt: { type: Date, default: null },
    dedupeKey: { type: String, default: null },
    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_notifications' }
);

WorkspaceNotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
WorkspaceNotificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
// Notifications are transient; drop them after 90 days.
WorkspaceNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export default mongoose.models.WorkspaceNotification ||
  mongoose.model('WorkspaceNotification', WorkspaceNotificationSchema);
