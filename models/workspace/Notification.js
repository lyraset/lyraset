import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Every notification is raised by something a person just did — a decision, a
 * day being closed. There are no scheduled or digest types: nothing in the
 * portal runs on a timer.
 */
export const NOTIFICATION_TYPES = Object.freeze([
  'AUTO_CLOCK_OUT',
  'REQUEST_DECISION',
  'LEAVE_DECISION',
  'APPROVAL_PENDING',
  'ACCOUNT',
]);

/**
 * In-app notifications, shown under the bell with an unread count. Email is
 * sent alongside where the Owner has enabled it; this collection is the record
 * either way, so nothing is lost when email is off or fails.
 *
 * `dedupeKey` makes a write idempotent, so an action retried after a failure
 * cannot notify the same person twice.
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
    // No default: an absent key stays absent, which keeps it out of the
    // partial dedupe index below.
    dedupeKey: { type: String, default: undefined },
    isSeedData: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'workspace_notifications' }
);

WorkspaceNotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
// Partial, not sparse: a sparse index still indexes an explicit null, so two
// notifications that simply have no dedupe key would collide with each other.
// Restricting the index to string keys means only real keys are unique.
WorkspaceNotificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } }, name: 'dedupe_key' }
);
// Notifications are transient; drop them after 90 days.
WorkspaceNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export default mongoose.models.WorkspaceNotification ||
  mongoose.model('WorkspaceNotification', WorkspaceNotificationSchema);
