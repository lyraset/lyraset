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
  CLOCK_IN_REMINDER: 'clockInReminder',
  CLOCK_OUT_REMINDER: 'clockOutReminder',
  AUTO_CLOCK_OUT: 'autoClockOutNotice',
  REQUEST_DECISION: 'requestDecision',
  LEAVE_DECISION: 'requestDecision',
  APPROVAL_PENDING: 'approverPending',
  DAILY_SUMMARY: 'leadershipDailySummary',
  PROBATION_ENDING: 'probationEndingAlert',
  ACCOUNT: null, // account notices are never switched off
});

function isEnabled(settings, type) {
  const toggle = TOGGLE_FOR_TYPE[type];
  if (!toggle) return true;
  return settings?.notifications?.[toggle] !== false;
}

/**
 * Create one notification.
 *
 * `dedupeKey` makes the write idempotent, which is what lets the reminder crons
 * be re-run safely: the second attempt hits the unique index and is dropped.
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

    const doc = await Notification.findOneAndUpdate(
      dedupeKey ? { dedupeKey } : { _id: null },
      {
        $setOnInsert: {
          userId,
          type,
          title,
          message,
          link,
          dedupeKey,
          read: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).catch(async (err) => {
      // A racing duplicate is the expected outcome, not a problem.
      if (err?.code === 11000) return null;
      throw err;
    });

    if (!doc) return null;

    const wantsEmail = email || settings?.notifications?.email;
    if (wantsEmail) await sendEmailFor(doc, { settings });

    return doc;
  } catch (err) {
    console.error('[workspace notify]', type, err);
    return null;
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
