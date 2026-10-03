import 'server-only';
import { DateTime } from 'luxon';
import WorkRequest from '../../../models/workspace/WorkRequest.js';
import LeaveRequest from '../../../models/workspace/LeaveRequest.js';
import Attendance from '../../../models/workspace/Attendance.js';
import User from '../../../models/workspace/User.js';
import { connectDB } from '../db.js';
import { getWorkspaceContext, scheduleFor, assertPeriodOpen, cycleFor } from '../context.js';
import { TIMEZONE } from '../timezone.js';
import { HttpError, assertCanApprove } from '../auth.js';
import { recomputeDay } from './attendance.js';
import { notify, notifyMany } from './notifications.js';
import { logAudit } from '../audit.js';
import { signedAssetUrl } from '../uploads.js';

/**
 * Corrections, work from home, official duty and overtime claims.
 *
 * They share a collection and an inbox because they share the rule that
 * matters: nobody approves their own request, and approving one changes an
 * attendance day, which then has to be recomputed rather than patched.
 */

const TYPE_LABELS = Object.freeze({
  CORRECTION: 'Attendance correction',
  WFH: 'Work from home',
  OFFICIAL_DUTY: 'Official duty',
  OVERTIME: 'Overtime claim',
});

export { TYPE_LABELS };

/** Turn a 'YYYY-MM-DD' and 'HH:mm' in Pakistan time into a real instant. */
function instantFor(workDate, time) {
  if (!time) return null;
  const dt = DateTime.fromISO(workDate + 'T' + time, { zone: TIMEZONE });
  return dt.isValid ? dt.toJSDate() : null;
}

/** Submit a request. The payload shape is checked per type before it lands. */
export async function submitRequest({ user, type, dates, payload, reason, evidence = null }) {
  const ctx = await getWorkspaceContext();
  await connectDB();

  if (!dates?.length) throw new HttpError(400, 'Pick at least one date.');
  for (const date of dates) {
    await assertPeriodOpen({ office: user.office, date, ctx });
  }

  if (type === 'CORRECTION') {
    const date = dates[0];
    const record = await Attendance.findOne({ userId: user.id, workDate: date }).lean();
    const schedule = scheduleFor(ctx, user, date);
    if (!schedule.working && !record) {
      throw new HttpError(400, 'That day was not a working day, so there is nothing to correct.');
    }
    if (!payload?.clockIn && !payload?.clockOut) {
      throw new HttpError(400, 'Give the clock-in time, the clock-out time, or both.');
    }
  }

  if (type === 'OVERTIME') {
    const date = dates[0];
    const record = await Attendance.findOne({ userId: user.id, workDate: date }).lean();
    if (!record?.clockOut) {
      throw new HttpError(
        400,
        'Claim overtime after the day is clocked out, so the hours are known.'
      );
    }
    if (!record.overtimeMinutes) {
      throw new HttpError(400, 'That day has no minutes beyond the required hours to claim.');
    }
    if (record.overtimeApproved) {
      throw new HttpError(409, 'Overtime for that day has already been approved.');
    }
  }

  const duplicate = await WorkRequest.findOne({
    userId: user.id,
    type,
    status: 'PENDING',
    dates: { $in: dates },
  }).lean();
  if (duplicate) {
    throw new HttpError(
      409,
      'You already have a pending ' + TYPE_LABELS[type].toLowerCase() + ' for one of those dates.'
    );
  }

  const created = await WorkRequest.create({
    userId: user.id,
    type,
    office: user.office,
    dates,
    payload,
    reason,
    evidence,
    status: 'PENDING',
  });

  const approvers = await User.find({ status: 'ACTIVE', role: { $in: ['OWNER', 'CEO'] } })
    .select('_id')
    .lean();
  await notifyMany(
    approvers.map((a) => String(a._id)).filter((id) => id !== String(user.id)),
    {
      type: 'APPROVAL_PENDING',
      title: 'New ' + TYPE_LABELS[type].toLowerCase() + ' from ' + user.name,
      message: dates.join(', '),
      link: '/workspace/approvals',
      dedupeKey: 'request:' + String(created._id),
      settings: ctx.settings,
    }
  );

  return serializeRequest(created.toObject());
}

/**
 * Approve or reject. Approval applies the request's effect to the attendance
 * record and then recomputes the day, so the resulting status comes from the
 * same engine as every other day rather than being set by hand.
 */
export async function decideRequest({
  approver,
  requestId,
  decision,
  comment = null,
  req = null,
  now = new Date(),
}) {
  const ctx = await getWorkspaceContext();
  await connectDB();

  const request = await WorkRequest.findById(requestId).lean();
  if (!request) throw new HttpError(404, 'That request no longer exists.');
  if (request.status !== 'PENDING')
    throw new HttpError(409, 'That request has already been decided.');

  const requester = await User.findById(request.userId).lean();
  if (!requester) throw new HttpError(404, 'The employee who filed this no longer has an account.');
  assertCanApprove(approver, { id: String(requester._id) });

  for (const date of request.dates ?? []) {
    await assertPeriodOpen({ office: request.office, date, ctx });
  }

  const user = { ...requester, id: String(requester._id) };
  const before = [];

  if (decision === 'APPROVE') {
    for (const date of request.dates ?? []) {
      const existing = await Attendance.findOne({ userId: user.id, workDate: date }).lean();
      before.push(
        existing
          ? {
              workDate: date,
              clockIn: existing.clockIn,
              clockOut: existing.clockOut,
              status: existing.status,
            }
          : { workDate: date, missing: true }
      );

      if (request.type === 'CORRECTION') {
        const cycle = cycleFor(ctx, date);
        const schedule = scheduleFor(ctx, user, date);
        const set = {
          office: user.office,
          cycleKey: cycle.key,
          shiftId: schedule.shiftId || null,
          editedBy: approver.id,
          editedAt: now,
          editReason: 'Correction approved: ' + request.reason,
          autoClosed: false,
        };
        const clockIn = instantFor(date, request.payload?.clockIn);
        const clockOut = instantFor(date, request.payload?.clockOut);
        if (clockIn) set.clockIn = clockIn;
        if (clockOut) set.clockOut = clockOut;

        await Attendance.updateOne(
          { userId: user.id, workDate: date },
          { $set: set, $setOnInsert: { userId: user.id, workDate: date } },
          { upsert: true, setDefaultsOnInsert: true }
        );
      }

      if (request.type === 'OVERTIME') {
        const record = await Attendance.findOne({ userId: user.id, workDate: date }).lean();
        if (record) {
          await Attendance.updateOne(
            { _id: record._id },
            {
              $set: {
                overtimeApproved: true,
                overtimeApprovedMinutes: Number(
                  request.payload?.minutes ?? record.overtimeMinutes ?? 0
                ),
              },
            }
          );
        }
      }
      // WFH and OFFICIAL_DUTY need no write here: recomputeDay reads the
      // approved request itself and sets the status from it.
    }
  }

  await WorkRequest.updateOne(
    { _id: request._id, status: 'PENDING' },
    {
      $set: {
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        reviewedBy: approver.id,
        reviewedAt: now,
        reviewComment: comment,
      },
    }
  );

  if (decision === 'APPROVE') {
    for (const date of request.dates ?? []) {
      await recomputeDay({ user, workDate: date, ctx, now }).catch(() => null);
      // A clock-in flagged as pending official duty is settled by the approval.
      if (request.type === 'OFFICIAL_DUTY') {
        await Attendance.updateOne(
          { userId: user.id, workDate: date },
          { $set: { officialDutyPending: false } }
        );
      }
    }
  }

  const after = [];
  for (const date of request.dates ?? []) {
    const record = await Attendance.findOne({ userId: user.id, workDate: date }).lean();
    after.push(
      record
        ? {
            workDate: date,
            clockIn: record.clockIn,
            clockOut: record.clockOut,
            status: record.status,
          }
        : { workDate: date, missing: true }
    );
  }

  await logAudit({
    actorId: approver.id,
    action: 'request.' + (decision === 'APPROVE' ? 'approve' : 'reject'),
    targetType: 'request',
    targetId: String(request._id),
    before: decision === 'APPROVE' ? before : null,
    after: decision === 'APPROVE' ? after : null,
    meta: { type: request.type, dates: request.dates, comment },
    req,
  });

  await notify({
    userId: request.userId,
    type: 'REQUEST_DECISION',
    title: TYPE_LABELS[request.type] + ' ' + (decision === 'APPROVE' ? 'approved' : 'rejected'),
    message: (request.dates ?? []).join(', ') + (comment ? ' — ' + comment : ''),
    link: '/workspace/requests',
    dedupeKey: 'request-decision:' + String(request._id),
    settings: ctx.settings,
  });

  const fresh = await WorkRequest.findById(request._id).lean();
  return serializeRequest(fresh);
}

/** Withdraw a pending request. */
export async function cancelRequest({ user, requestId }) {
  await connectDB();
  const updated = await WorkRequest.findOneAndUpdate(
    { _id: requestId, userId: user.id, status: 'PENDING' },
    { $set: { status: 'CANCELLED' } },
    { new: true }
  ).lean();
  if (!updated) throw new HttpError(409, 'That request cannot be withdrawn any more.');
  return serializeRequest(updated);
}

export function serializeRequest(request, { requester = null } = {}) {
  if (!request) return null;
  return {
    id: String(request._id),
    userId: String(request.userId),
    userName: requester?.name ?? null,
    employeeId: requester?.employeeId ?? null,
    type: request.type,
    typeLabel: TYPE_LABELS[request.type] ?? request.type,
    office: request.office,
    dates: request.dates ?? [],
    payload: request.payload ?? {},
    reason: request.reason,
    evidence: request.evidence?.publicId
      ? {
          publicId: request.evidence.publicId,
          filename: request.evidence.filename ?? null,
          url: signedAssetUrl(request.evidence.publicId, {
            resourceType: request.evidence.resourceType ?? 'image',
          }),
        }
      : null,
    status: request.status,
    reviewedBy: request.reviewedBy ? String(request.reviewedBy) : null,
    reviewedAt: request.reviewedAt ?? null,
    reviewComment: request.reviewComment ?? null,
    createdAt: request.createdAt,
  };
}

/**
 * Everything waiting for a decision, for the approvals inbox.
 * The approver's own requests are excluded, because they cannot act on them.
 */
export async function pendingApprovals({ approver, type = null }) {
  await connectDB();
  const [requests, leaves] = await Promise.all([
    WorkRequest.find({
      status: 'PENDING',
      userId: { $ne: approver.id },
      ...(type && type !== 'LEAVE' ? { type } : {}),
    })
      .sort({ createdAt: 1 })
      .lean(),
    type && type !== 'LEAVE'
      ? []
      : LeaveRequest.find({
          status: { $in: ['PENDING', 'CANCEL_PENDING'] },
          userId: { $ne: approver.id },
        })
          .sort({ createdAt: 1 })
          .lean(),
  ]);

  const userIds = [...new Set([...requests, ...leaves].map((r) => String(r.userId)))];
  const users = await User.find({ _id: { $in: userIds } })
    .select('name employeeId office department')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));

  return {
    requests: requests.map((r) => serializeRequest(r, { requester: byId.get(String(r.userId)) })),
    leaves,
    usersById: byId,
  };
}
