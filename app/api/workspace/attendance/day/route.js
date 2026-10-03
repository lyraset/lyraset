import { z } from 'zod';
import { DateTime } from 'luxon';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission, HttpError } from '@/lib/workspace/auth';
import { api, json, readJson } from '@/lib/workspace/route';
import { parseBody, dateString, objectId, timeString } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import Attendance from '@/models/workspace/Attendance';
import User from '@/models/workspace/User';
import {
  getWorkspaceContext,
  cycleFor,
  scheduleFor,
  assertPeriodOpen,
} from '@/lib/workspace/context';
import { TIMEZONE } from '@/lib/workspace/timezone';
import { recomputeDay, serializeRecord } from '@/lib/workspace/services/attendance';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  userId: objectId,
  workDate: dateString,
  clockIn: timeString.nullish(),
  clockOut: timeString.nullish(),
  overtimeApproved: z.boolean().optional(),
  overtimeApprovedMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  reason: z.string().trim().min(5, 'Say why you are changing this record.').max(400),
});

/**
 * Manual edit of one attendance day (Owner only).
 *
 * A reason is required and the before/after values are audited, because this
 * is the one route that can change what the record says happened without the
 * employee having done anything.
 */
export const PATCH = api(async (req) => {
  const actor = await requireApiPermission(P.ATTENDANCE_EDIT);
  const input = parseBody(Schema, await readJson(req));

  await connectDB();
  const found = await User.findById(input.userId).lean();
  if (!found) throw new HttpError(404, 'That employee no longer has an account.');
  const user = { ...found, id: String(found._id) };

  const ctx = await getWorkspaceContext();
  await assertPeriodOpen({ office: user.office, date: input.workDate, ctx });

  const before = await Attendance.findOne({ userId: user.id, workDate: input.workDate }).lean();

  const toInstant = (time) =>
    time ? DateTime.fromISO(input.workDate + 'T' + time, { zone: TIMEZONE }).toJSDate() : null;

  const clockIn = toInstant(input.clockIn);
  const clockOut = toInstant(input.clockOut);
  if (clockIn && clockOut && clockOut <= clockIn) {
    throw new HttpError(400, 'The clock-out time must be after the clock-in time.');
  }

  const cycle = cycleFor(ctx, input.workDate);
  const schedule = scheduleFor(ctx, user, input.workDate);

  const set = {
    office: user.office,
    cycleKey: cycle.key,
    shiftId: schedule.shiftId || null,
    editedBy: actor.id,
    editedAt: new Date(),
    editReason: input.reason,
  };
  if (input.clockIn !== undefined) set.clockIn = clockIn;
  if (input.clockOut !== undefined) {
    set.clockOut = clockOut;
    // An edited clock-out is a real one, so the auto-close flag no longer holds.
    if (clockOut) set.autoClosed = false;
  }
  if (input.overtimeApproved !== undefined) {
    set.overtimeApproved = input.overtimeApproved;
    set.overtimeApprovedMinutes = input.overtimeApproved
      ? (input.overtimeApprovedMinutes ?? before?.overtimeMinutes ?? 0)
      : 0;
  }

  await Attendance.updateOne(
    { userId: user.id, workDate: input.workDate },
    { $set: set, $setOnInsert: { userId: user.id, workDate: input.workDate } },
    { upsert: true, setDefaultsOnInsert: true }
  );

  await recomputeDay({ user, workDate: input.workDate, ctx });
  const after = await Attendance.findOne({ userId: user.id, workDate: input.workDate }).lean();

  await logAudit({
    actorId: actor.id,
    action: 'attendance.edit',
    targetType: 'attendance',
    targetId: String(after._id),
    before: before
      ? {
          clockIn: before.clockIn,
          clockOut: before.clockOut,
          status: before.status,
          workedMinutes: before.workedMinutes,
        }
      : { missing: true },
    after: {
      clockIn: after.clockIn,
      clockOut: after.clockOut,
      status: after.status,
      workedMinutes: after.workedMinutes,
    },
    meta: { userId: user.id, workDate: input.workDate, reason: input.reason },
    req,
  });

  return json({ record: serializeRecord(after) });
});
