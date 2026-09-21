import { z } from 'zod';
import { P, can } from '@/lib/workspace/permissions';
import { requireApiUser, requireApiPermission, HttpError } from '@/lib/workspace/auth';
import { api, json, query, readJson } from '@/lib/workspace/route';
import {
  parseBody,
  parseQuery,
  dateString,
  objectId,
  asset,
  office,
} from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import LeaveRequest from '@/models/workspace/LeaveRequest';
import LeaveType from '@/models/workspace/LeaveType';
import User from '@/models/workspace/User';
import {
  applyForLeave,
  serializeLeaveRequest,
  getBalanceSummary,
} from '@/lib/workspace/services/leave';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ListSchema = z.object({
  scope: z.enum(['own', 'all']).default('own'),
  status: z.string().trim().max(30).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  office: office.optional(),
  userId: objectId.optional(),
});

/** Leave requests: your own by default, or everyone's with the calendar permission. */
export const GET = api(async (req) => {
  const user = await requireApiUser();
  const filters = parseQuery(ListSchema, query(req));

  const wantsAll = filters.scope === 'all' || Boolean(filters.userId);
  if (wantsAll && !can(user, P.LEAVE_CALENDAR_VIEW)) {
    throw new HttpError(403, 'You can only see your own leave.');
  }
  if (!wantsAll && !can(user, P.LEAVE_REQUEST)) {
    throw new HttpError(403, "You don't apply for leave.");
  }

  await connectDB();
  const find = {};
  if (!wantsAll) find.userId = user.id;
  if (filters.userId) find.userId = filters.userId;
  if (filters.status) find.status = filters.status;
  if (filters.office) find.office = filters.office;
  if (filters.from && filters.to) {
    find.from = { $lte: filters.to };
    find.to = { $gte: filters.from };
  }

  const requests = await LeaveRequest.find(find).sort({ from: -1 }).limit(300).lean();
  const [types, people] = await Promise.all([
    LeaveType.find({}).lean(),
    wantsAll
      ? User.find({ _id: { $in: requests.map((r) => r.userId) } })
          .select('name employeeId')
          .lean()
      : [],
  ]);
  const typeById = new Map(types.map((t) => [String(t._id), t]));
  const userById = new Map(people.map((p) => [String(p._id), p]));

  const balance = can(user, P.LEAVE_REQUEST)
    ? await getBalanceSummary({ user }).catch(() => null)
    : null;

  return json({
    requests: requests.map((r) =>
      serializeLeaveRequest(r, {
        leaveType: typeById.get(String(r.leaveTypeId)),
        requester: userById.get(String(r.userId)),
      })
    ),
    balance,
  });
});

const ApplySchema = z.object({
  leaveTypeId: objectId,
  from: dateString,
  to: dateString,
  halfDay: z.boolean().default(false),
  hours: z.coerce.number().min(0.5).max(8).nullish(),
  reason: z.string().trim().min(5, 'Say why you need the leave.').max(1000),
  attachment: asset.nullish(),
});

/** Apply for leave. The days are reserved against the quota immediately. */
export const POST = api(async (req) => {
  const user = await requireApiPermission(P.LEAVE_REQUEST);
  const input = parseBody(ApplySchema, await readJson(req));
  if (input.to < input.from)
    throw new HttpError(400, 'The end date cannot be before the start date.');

  const request = await applyForLeave({ user, input });

  await logAudit({
    actorId: user.id,
    action: 'leave.apply',
    targetType: 'leave_request',
    targetId: request.id,
    after: { from: request.from, to: request.to, days: request.days, paidDays: request.paidDays },
    req,
  });

  return json({ request }, 201);
});
