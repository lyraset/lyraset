import 'server-only';
import { connectDB } from '../db.js';
import Notification from '../../../models/workspace/Notification.js';
import User from '../../../models/workspace/User.js';

/**
 * In-app notifications, with email alongside when the Owner has enabled it.
 *
 * Notifications are never allowed to fail the action that triggered them: a
 * leave approval that worked must not report an error because the mail server
 * was unreachable. Every failure here is logged and swallowed.
 *
 * Email reuses the repo's existing Resend-over-fetch approach rather than
 * adding an SDK, so there is one place that knows how mail leaves this app.
 */

/** Map a notification type to the settings toggle that governs it. */
const TOGGLE_FOR_TYPE = Object.freeze({
  AUTO_CLOCK_OUT: 'autoClockOutNotice',
  REQUEST_DECISION: 'requestDecision',
  LEAVE_DECISION: 'requestDecision',
  APPROVAL_PENDING: 'approverPending',
  ACCOUNT: null, // account notices are never switched off
});

function isEnabled(settings, type) {
  const toggle = TOGGLE_FOR_TYPE[type];
  if (!toggle) return true;
  return settings?.notifications?.[toggle] !== false;
}

/**
 * Create one notification. Returns the new document, or null when nothing was
 * created — the type is switched off, or a `dedupeKey` had already been used.
 *
 * `dedupeKey` makes the write idempotent: a second attempt with the same key
 * finds the existing row and is dropped, so an action retried after a failure
 * cannot tell someone twice or send a second email.
 */
export async function notify({
  userId,
  type,
  title,
  message = null,
  link = null,
  dedupeKey = null,
  settings = null,
  email = false,
}) {
  try {
    if (!isEnabled(settings, type)) return null;
    await connectDB();

    // The field is left off entirely when there is no key, so nothing lands in
    // the dedupe index that was never meant to be deduplicated.
    const fields = { userId, type, title, message, link, read: false };
    const created = dedupeKey
      ? await insertOnce(dedupeKey, { ...fields, dedupeKey })
      : await Notification.create(fields);
    if (!created) return null;

    if (email || settings?.notifications?.email) {
      await sendEmailFor(created, { settings });
    }
    return created;
  } catch (err) {
    console.error('[workspace notify]', type, err);
    return null;
  }
}

/**
 * Insert a notification only if its key has not been used, and say which
 * happened. `new: true` alone would hand back the pre-existing row as though
 * it were fresh, and the caller would email about it again — so the result
 * metadata is what decides.
 */
async function insertOnce(dedupeKey, fields) {
  try {
    const result = await Notification.findOneAndUpdate(
      { dedupeKey },
      { $setOnInsert: fields },
      { upsert: true, new: true, setDefaultsOnInsert: true, includeResultMetadata: true }
    );
    if (result?.lastErrorObject?.updatedExisting) return null; // already sent
    return result?.value ?? null;
  } catch (err) {
    // A concurrent caller won the race to the unique index. That is the
    // intended outcome, not a failure.
    if (err?.code === 11000) return null;
    throw err;
  }
}

/** Notify several people at once, e.g. every approver. */
export async function notifyMany(userIds, payload) {
  const results = [];
  for (const userId of [...new Set(userIds.map(String))]) {
    results.push(
      await notify({
        ...payload,
        userId,
        dedupeKey: payload.dedupeKey ? payload.dedupeKey + ':' + userId : null,
      })
    );
  }
  return results.filter(Boolean);
}

async function sendEmailFor(doc, { settings }) {
  try {
    const user = await User.findById(doc.userId).select('email name').lean();
    if (!user?.email) return;
    const sent = await sendEmail({
      to: user.email,
      subject: doc.title,
      lines: [doc.message, doc.link ? absoluteUrl(doc.link) : null].filter(Boolean),
      settings,
    });
    if (sent) await Notification.updateOne({ _id: doc._id }, { $set: { emailedAt: new Date() } });
  } catch (err) {
    console.error('[workspace notify email]', err);
  }
}

function absoluteUrl(path) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lyraset.com';
  return base.replace(/\/$/, '') + path;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Send one email through Resend. Returns false (never throws) when the key is
 * missing, which is the normal state in development.
 */
export async function sendEmail({ to, subject, lines = [], html = null }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return false;
  const from = process.env.WORKSPACE_EMAIL_FROM || 'LYRASET Workspace <onboarding@resend.dev>';

  const body =
    html ||
    '<div style="font-family:system-ui,sans-serif;color:#0e1a36">' +
      '<h2 style="margin:0 0 12px;font-size:18px">' +
      escapeHtml(subject) +
      '</h2>' +
      lines.map((line) => '<p style="margin:6px 0">' + escapeHtml(line) + '</p>').join('') +
      '</div>';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html: body }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Unread count for the bell. */
export async function unreadCount(userId) {
  await connectDB();
  return Notification.countDocuments({ userId, read: false });
}

/** The latest notifications for one person. */
export async function listNotifications(userId, { limit = 30 } = {}) {
  await connectDB();
  const rows = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
  return rows.map((n) => ({
    id: String(n._id),
    type: n.type,
    title: n.title,
    message: n.message ?? null,
    link: n.link ?? null,
    read: Boolean(n.read),
    createdAt: n.createdAt,
  }));
}

/** Mark one notification, or all of them, as read. */
export async function markRead(userId, { id = null } = {}) {
  await connectDB();
  const filter = { userId, read: false };
  if (id) filter._id = id;
  const res = await Notification.updateMany(filter, { $set: { read: true, readAt: new Date() } });
  return res.modifiedCount ?? 0;
}
