import 'server-only';
import { DateTime } from 'luxon';
import LeaveRequest from '../../../models/workspace/LeaveRequest.js';
import LeaveBalance from '../../../models/workspace/LeaveBalance.js';
import LeaveType from '../../../models/workspace/LeaveType.js';
import Attendance from '../../../models/workspace/Attendance.js';
import User from '../../../models/workspace/User.js';
import { connectDB } from '../db.js';
import {
  getWorkspaceContext,
  scheduleFor,
  cycleFor,
  timezoneFor,
  holidayDatesFor,
  assertPeriodOpen,
} from '../context.js';
import {
  expandLeaveDays,
  splitLeaveByCycle,
  applyQuota,
  computeCarryForward,
  remainingPaidLeave,
  validateAgainstType,
  formatDays,
} from '../calc/leave.js';
import { getCycleForDate } from '../calc/cycle.js';
import { HttpError, assertCanApprove } from '../auth.js';
import { withTransaction, withSession } from './tx.js';
import { recomputeDay } from './attendance.js';
import { notify, notifyMany } from './notifications.js';
import { signedAssetUrl } from '../uploads.js';

/**
 * Leave: applying, costing, approving and keeping balances honest.
 *
 * The rule that shapes this module is that a balance must never be wrong, even
 * briefly. Submitting a request moves days into `pending` straight away, so two
 * applications filed the same morning cannot both be told the quota is free;
 * approval moves them from `pending` to `used`, and every other ending
 * (rejection, cancellation) releases them.
 */

/** The balance row for one person and one cycle, created on first use. */
export async function ensureBalance({ user, cycle, settings, session = null }) {
  await connectDB();
  const existing = await LeaveBalance.findOne({ userId: user.id ?? user._id, cycleKey: cycle.key })
    .session(session)
    .lean();
  if (existing) return existing;

  // Carry-in comes from what the previous cycle left behind.
  const previous = await LeaveBalance.findOne({
    userId: user.id ?? user._id,
    cycleEnd: { $lt: cycle.start },
  })
    .sort({ cycleEnd: -1 })
    .session(session)
    .lean();

  // Nothing closes a cycle on a schedule, so the carry-in is worked out here,
  // when the new cycle's row is first needed. `settings` is the company
  // settings document, whose carry-forward fields are named exactly as the
  // calculation expects.
  const carriedIn = previous ? computeCarryForward(previous, settings ?? undefined) : 0;

  await LeaveBalance.updateOne(
    { userId: user.id ?? user._id, cycleKey: cycle.key },
    {
      $setOnInsert: {
        userId: user.id ?? user._id,
        cycleKey: cycle.key,
        cycleStart: cycle.start,
        cycleEnd: cycle.end,
        quota: Number(settings?.monthlyLeaveQuota ?? 0),
        carriedIn,
        used: 0,
        pending: 0,
        carriedOut: 0,
      },
    },
    { upsert: true, ...withSession(session) }
  );

  return LeaveBalance.findOne({ userId: user.id ?? user._id, cycleKey: cycle.key })
    .session(session)
    .lean();
}

/** Working-day and holiday predicates for one user, for the leave calc. */
function calendarFor(ctx, user) {
  const holidays = holidayDatesFor(ctx, user.office);
  return {
    isWorkingDay: (date) => scheduleFor(ctx, user, date).working,
    isHoliday: (date) => holidays.has(date),
  };
}

/**
 * Price a request without saving it: which days it charges, how they split
 * across cycles, and what the quota allows. The form calls this as the
 * employee picks dates, so "Paid leaves remaining this cycle" is never a guess.
 */
export async function quoteLeave({
  user,
  leaveTypeId,
  from,
  to,
  halfDay = false,
  hours = null,
  hasDocument = false,
  now = new Date(),
}) {
  const ctx = await getWorkspaceContext();
  await connectDB();

  const leaveType = await LeaveType.findById(leaveTypeId).lean();
  if (!leaveType) throw new HttpError(400, 'Pick a leave type.');
  if (leaveType.offices?.length && !leaveType.offices.includes(user.office)) {
    throw new HttpError(400, leaveType.name + ' is not available at your office.');
  }

  const { isWorkingDay, isHoliday } = calendarFor(ctx, user);
  const { entries, days } = expandLeaveDays({
    from,
    to,
    halfDay,
    isWorkingDay,
    isHoliday,
    sandwichRule: ctx.leaveSettings.sandwichRule,
  });

  if (days <= 0) {
    throw new HttpError(
      400,
      'Those dates are all non-working days, so there is no leave to apply for.'
    );
  }

  const tz = timezoneFor(ctx, user);
  const splits = splitLeaveByCycle(entries, ctx.cycleHistory, tz);

  const problems = validateAgainstType({ leaveType, days, from, halfDay, hasDocument, now, tz });

  // Each cycle is costed against its own balance and its own quota.
  const costed = [];
  let blocked = false;
  const notes = [];
  for (const split of splits) {
    const cycle = getCycleForDate(split.dates[0], ctx.cycleHistory, tz);
    const balance = await ensureBalance({ user, cycle, settings: ctx.settings });
    const usedOfType = Number(balance.usedByType?.[String(leaveType._id)] ?? 0);
    const result = applyQuota({
      days: split.days,
      leaveType,
      balance,
      settings: ctx.leaveSettings,
      usedOfType,
    });
    if (result.blocked) blocked = true;
    if (result.reason) notes.push(cycle.label + ': ' + result.reason);
    costed.push({
      ...split,
      paidDays: result.paidDays,
      unpaidDays: result.unpaidDays,
      blocked: result.blocked,
      remainingBefore: remainingPaidLeave(balance, ctx.leaveSettings),
    });
  }

  return {
    days,
    entries,
    countedDates: entries.filter((e) => e.counted).map((e) => e.date),
    splits: costed,
    paidDays: costed.reduce((s, c) => s + c.paidDays, 0),
    unpaidDays: costed.reduce((s, c) => s + c.unpaidDays, 0),
    blocked,
    problems,
    notes,
    leaveType: {
      id: String(leaveType._id),
      name: leaveType.name,
      paid: leaveType.paid,
      allowHalfDay: leaveType.allowHalfDay,
      requiresDocument: leaveType.requiresDocument,
      documentAfterDays: leaveType.documentAfterDays,
    },
  };
}

/** Submit a leave request, reserving the days it costs against each cycle. */
export async function applyForLeave({ user, input, now = new Date() }) {
  const ctx = await getWorkspaceContext();
  await connectDB();
  await assertPeriodOpen({ office: user.office, date: input.from, ctx });

  const quote = await quoteLeave({
    user,
    leaveTypeId: input.leaveTypeId,
    from: input.from,
    to: input.to,
    halfDay: input.halfDay,
    hours: input.hours,
    hasDocument: Boolean(input.attachment?.publicId),
    now,
  });

  if (quote.problems.length) throw new HttpError(400, quote.problems[0]);
  if (quote.blocked) {
    const reason = quote.splits.find((s) => s.blocked);
    throw new HttpError(
      409,
      'You only have ' +
        formatDays(reason?.remainingBefore ?? 0) +
        ' paid leave day(s) left in that cycle.'
    );
  }

  // A second request covering the same day would double-charge the balance.
  const overlapping = await LeaveRequest.findOne({
    userId: user.id,
    status: { $in: ['PENDING', 'APPROVED', 'PARTIALLY_APPROVED', 'CANCEL_PENDING'] },
    countedDates: { $in: quote.countedDates },
  }).lean();
  if (overlapping) {
    throw new HttpError(409, 'You already have a leave request covering one of those days.');
  }

  const created = await withTransaction(async (session) => {
    const [request] = await LeaveRequest.create(
      [
        {
          userId: user.id,
          leaveTypeId: input.leaveTypeId,
          office: user.office,
          from: input.from,
          to: input.to,
          halfDay: Boolean(input.halfDay),
          hours: input.hours ?? null,
          days: quote.days,
          paidDays: quote.paidDays,
          unpaidDays: quote.unpaidDays,
          countedDates: quote.countedDates,
          approvedDates: [],
          cycleSplits: quote.splits.map((s) => ({
            cycleKey: s.cycleKey,
            cycleStart: s.cycleStart,
            cycleEnd: s.cycleEnd,
            days: s.days,
            paidDays: s.paidDays,
            unpaidDays: s.unpaidDays,
            dates: s.dates,
          })),
          reason: input.reason,
          attachment: input.attachment ?? null,
          status: 'PENDING',
        },
      ],
      withSession(session)
    );

    // Reserve the paid days so a second application sees them as spoken for.
    for (const split of quote.splits) {
      if (split.paidDays <= 0) continue;
      await LeaveBalance.updateOne(
        { userId: user.id, cycleKey: split.cycleKey },
        { $inc: { pending: split.paidDays } },
        withSession(session)
      );
    }

    return request;
  });

  await notifyApprovers({
    ctx,
    requesterId: user.id,
    title: 'New leave request from ' + user.name,
    message: quote.days + ' day(s) from ' + input.from + ' to ' + input.to + '.',
    link: '/workspace/approvals',
    dedupeKey: 'leave:' + String(created._id),
  });

  return serializeLeaveRequest(created.toObject());
}

/** Everyone who may approve, minus the requester (nobody approves themselves). */
async function notifyApprovers({ ctx, requesterId, title, message, link, dedupeKey }) {
  const approvers = await User.find({ status: 'ACTIVE', role: { $in: ['OWNER', 'CEO'] } })
    .select('_id')
    .lean();
  const ids = approvers.map((a) => String(a._id)).filter((id) => id !== String(requesterId));
  if (!ids.length) return;
  await notifyMany(ids, {
    type: 'APPROVAL_PENDING',
    title,
    message,
    link,
    dedupeKey,
    settings: ctx.settings,
  });
}

/**
 * Approve, partially approve or reject a request.
 *
 * On approval the reserved days move from `pending` to `used` and every
 * affected attendance day is recomputed, which is what turns those days into
 * ON_LEAVE rather than ABSENT.
 */
export async function decideLeave({
  approver,
  requestId,
  decision,
  approvedDates = null,
  comment = null,
  now = new Date(),
}) {
  const ctx = await getWorkspaceContext();
  await connectDB();

  const request = await LeaveRequest.findById(requestId).lean();
  if (!request) throw new HttpError(404, 'That leave request no longer exists.');
  if (!['PENDING', 'CANCEL_PENDING'].includes(request.status)) {
    throw new HttpError(409, 'That request has already been decided.');
  }

  const requester = await User.findById(request.userId).lean();
  if (!requester) throw new HttpError(404, 'The employee who filed this no longer has an account.');
  assertCanApprove(approver, { id: String(requester._id) });

  await assertPeriodOpen({ office: request.office, date: request.from, ctx });

  const granted =
    decision === 'REJECT'
      ? []
      : (approvedDates ?? request.countedDates).filter((d) => request.countedDates.includes(d));

  if (decision !== 'REJECT' && !granted.length) {
    throw new HttpError(400, 'Select at least one date to approve, or reject the request.');
  }

  const status =
    decision === 'REJECT'
      ? 'REJECTED'
      : granted.length === request.countedDates.length
        ? 'APPROVED'
        : 'PARTIALLY_APPROVED';

  // Re-price only the granted days: a partial approval costs less than asked.
  const grantedByCycle = new Map();
  for (const split of request.cycleSplits ?? []) {
    const dates = split.dates.filter((d) => granted.includes(d));
    if (!dates.length) {
      grantedByCycle.set(split.cycleKey, {
        ...split,
        dates: [],
        days: 0,
        paidDays: 0,
        unpaidDays: 0,
      });
      continue;
    }
    const share = dates.length / split.dates.length;
    grantedByCycle.set(split.cycleKey, {
      ...split,
      dates,
      days: Math.round(split.days * share * 2) / 2,
      paidDays: Math.round(split.paidDays * share * 2) / 2,
      unpaidDays: Math.round(split.unpaidDays * share * 2) / 2,
    });
  }

  await withTransaction(async (session) => {
    for (const split of request.cycleSplits ?? []) {
      const grantedSplit = grantedByCycle.get(split.cycleKey);
      // Release everything this cycle had reserved, then charge what was granted.
      const inc = { pending: -split.paidDays };
      if (grantedSplit?.paidDays) {
        inc.used = grantedSplit.paidDays;
        inc['usedByType.' + String(request.leaveTypeId)] = grantedSplit.paidDays;
      }
      await LeaveBalance.updateOne(
        { userId: request.userId, cycleKey: split.cycleKey },
        { $inc: inc },
        withSession(session)
      );
    }

    await LeaveRequest.updateOne(
      { _id: request._id, status: request.status },
      {
        $set: {
          status,
          approvedDates: granted,
          paidDays: [...grantedByCycle.values()].reduce((s, c) => s + c.paidDays, 0),
          unpaidDays: [...grantedByCycle.values()].reduce((s, c) => s + c.unpaidDays, 0),
          cycleSplits: [...grantedByCycle.values()],
          reviewedBy: approver.id,
          reviewedAt: now,
          reviewComment: comment,
        },
      },
      withSession(session)
    );
  });

  // Affected days become ON_LEAVE; days that lost their leave fall back.
  for (const date of request.countedDates) {
    await recomputeDay({ user: requester, workDate: date, ctx, now }).catch(() => null);
  }

  await notify({
    userId: request.userId,
    type: 'LEAVE_DECISION',
    title: status === 'REJECTED' ? 'Leave request rejected' : 'Leave request approved',
    message:
      (status === 'PARTIALLY_APPROVED'
        ? granted.length + ' of ' + request.countedDates.length + ' day(s) approved. '
        : '') + (comment || ''),
    link: '/workspace/leave',
    dedupeKey: 'leave-decision:' + String(request._id),
    settings: ctx.settings,
  });

  const fresh = await LeaveRequest.findById(request._id).lean();
  return serializeLeaveRequest(fresh);
}

/**
 * Cancel a request. A pending one is withdrawn outright; an approved future
 * one goes back for approval, and its balance is only released once that is
 * granted, so a cancellation cannot be used to free days silently.
 */
export async function cancelLeave({ user, requestId, reason = null, now = new Date() }) {
  const ctx = await getWorkspaceContext();
  await connectDB();

  const request = await LeaveRequest.findById(requestId).lean();
  if (!request) throw new HttpError(404, 'That leave request no longer exists.');
  if (String(request.userId) !== String(user.id)) {
    throw new HttpError(403, 'You can only cancel your own leave.');
  }

  if (request.status === 'PENDING') {
    await withTransaction(async (session) => {
      for (const split of request.cycleSplits ?? []) {
        if (!split.paidDays) continue;
        await LeaveBalance.updateOne(
          { userId: request.userId, cycleKey: split.cycleKey },
          { $inc: { pending: -split.paidDays } },
          withSession(session)
        );
      }
      await LeaveRequest.updateOne(
        { _id: request._id, status: 'PENDING' },
        { $set: { status: 'CANCELLED', cancelReason: reason, reviewedAt: now } },
        withSession(session)
      );
    });
    const fresh = await LeaveRequest.findById(request._id).lean();
    return serializeLeaveRequest(fresh);
  }

  if (request.status !== 'APPROVED' && request.status !== 'PARTIALLY_APPROVED') {
    throw new HttpError(409, 'Only a pending or approved leave can be cancelled.');
  }

  // "Already started" is judged in the employee's own timezone, not in UTC.
  const tz = timezoneFor(ctx, user);
  const firstDay = request.approvedDates?.[0] ?? request.from;
  const today = DateTime.fromJSDate(now, { zone: tz }).toISODate();
  if (firstDay < today) {
    throw new HttpError(
      409,
      'That leave has already started. Ask the Owner for a correction instead.'
    );
  }

  await LeaveRequest.updateOne(
    { _id: request._id },
    { $set: { status: 'CANCEL_PENDING', cancelReason: reason } }
  );

  await notifyApprovers({
    ctx,
    requesterId: user.id,
    title: user.name + ' asked to cancel approved leave',
    message: request.from + ' to ' + request.to + '. ' + (reason || ''),
    link: '/workspace/approvals',
    dedupeKey: 'leave-cancel:' + String(request._id),
  });

  const fresh = await LeaveRequest.findById(request._id).lean();
  return serializeLeaveRequest(fresh);
}

/** Approve a cancellation: the leave is withdrawn and the balance restored. */
export async function approveCancellation({ approver, requestId, now = new Date() }) {
  const ctx = await getWorkspaceContext();
  await connectDB();

  const request = await LeaveRequest.findById(requestId).lean();
  if (!request) throw new HttpError(404, 'That leave request no longer exists.');
  if (request.status !== 'CANCEL_PENDING') {
    throw new HttpError(409, 'That request is not waiting to be cancelled.');
  }
  assertCanApprove(approver, { id: String(request.userId) });

  const requester = await User.findById(request.userId).lean();

  await withTransaction(async (session) => {
    for (const split of request.cycleSplits ?? []) {
      if (!split.paidDays) continue;
      await LeaveBalance.updateOne(
        { userId: request.userId, cycleKey: split.cycleKey },
        {
          $inc: {
            used: -split.paidDays,
            ['usedByType.' + String(request.leaveTypeId)]: -split.paidDays,
          },
        },
        withSession(session)
      );
    }
    await LeaveRequest.updateOne(
      { _id: request._id, status: 'CANCEL_PENDING' },
      {
        $set: { status: 'CANCELLED', approvedDates: [], reviewedBy: approver.id, reviewedAt: now },
      },
      withSession(session)
    );
  });

  for (const date of request.countedDates ?? []) {
    await recomputeDay({ user: requester, workDate: date, ctx, now }).catch(() => null);
  }

  await notify({
    userId: request.userId,
    type: 'LEAVE_DECISION',
    title: 'Leave cancellation approved',
    message: 'Your leave from ' + request.from + ' to ' + request.to + ' has been cancelled.',
    link: '/workspace/leave',
    dedupeKey: 'leave-cancelled:' + String(request._id),
    settings: ctx.settings,
  });

  const fresh = await LeaveRequest.findById(request._id).lean();
  return serializeLeaveRequest(fresh);
}

/** The balance summary shown on the leave page and the dashboard. */
export async function getBalanceSummary({ user, date = new Date() }) {
  const ctx = await getWorkspaceContext();
  const cycle = cycleFor(ctx, user, date);
  const balance = await ensureBalance({ user, cycle, settings: ctx.settings });
  return {
    cycle,
    quota: balance.quota,
    carriedIn: balance.carriedIn,
    used: balance.used,
    pending: balance.pending,
    remaining: remainingPaidLeave(balance, ctx.leaveSettings),
    carryForwardMode: ctx.leaveSettings.leaveCarryForward,
    maxCarryForward: ctx.leaveSettings.maxCarryForward,
    overQuotaBehavior: ctx.leaveSettings.overQuotaBehavior,
  };
}

export function serializeLeaveRequest(request, { leaveType = null, requester = null } = {}) {
  if (!request) return null;
  return {
    id: String(request._id),
    userId: String(request.userId),
    userName: requester?.name ?? null,
    employeeId: requester?.employeeId ?? null,
    leaveTypeId: String(request.leaveTypeId),
    leaveTypeName: leaveType?.name ?? null,
    leaveTypeColor: leaveType?.color ?? null,
    leaveTypePaid: leaveType?.paid ?? null,
    office: request.office,
    from: request.from,
    to: request.to,
    halfDay: Boolean(request.halfDay),
    hours: request.hours ?? null,
    days: request.days,
    paidDays: request.paidDays,
    unpaidDays: request.unpaidDays,
    countedDates: request.countedDates ?? [],
    approvedDates: request.approvedDates ?? [],
    cycleSplits: (request.cycleSplits ?? []).map((s) => ({
      cycleKey: s.cycleKey,
      days: s.days,
      paidDays: s.paidDays,
      unpaidDays: s.unpaidDays,
    })),
    reason: request.reason,
    attachment: request.attachment?.publicId
      ? {
          publicId: request.attachment.publicId,
          filename: request.attachment.filename ?? null,
          url: signedAssetUrl(request.attachment.publicId, {
            resourceType: request.attachment.resourceType ?? 'image',
          }),
        }
      : null,
    status: request.status,
    reviewedBy: request.reviewedBy ? String(request.reviewedBy) : null,
    reviewedAt: request.reviewedAt ?? null,
    reviewComment: request.reviewComment ?? null,
    cancelReason: request.cancelReason ?? null,
    createdAt: request.createdAt,
  };
}

/** Mark the attendance rows an approved leave covers. Used after calendar changes. */
export async function refreshLeaveDays({ userId, dates, ctx, now = new Date() }) {
  const context = ctx ?? (await getWorkspaceContext());
  const user = await User.findById(userId).lean();
  if (!user) return 0;
  let touched = 0;
  for (const date of dates) {
    const exists = await Attendance.exists({ userId, workDate: date });
    if (!exists) continue;
    await recomputeDay({
      user: { ...user, id: String(user._id) },
      workDate: date,
      ctx: context,
      now,
    });
    touched += 1;
  }
  return touched;
}
