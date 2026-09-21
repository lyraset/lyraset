import { z } from 'zod';
import { P, can } from '@/lib/workspace/permissions';
import { requireApiUser, requireApiPermission, HttpError } from '@/lib/workspace/auth';
import { api, json, query, readJson } from '@/lib/workspace/route';
import { parseBody, parseQuery, dateString, asset, timeString } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import WorkRequest from '@/models/workspace/WorkRequest';
import User from '@/models/workspace/User';
import { submitRequest, serializeRequest } from '@/lib/workspace/services/requests';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ListSchema = z.object({
  scope: z.enum(['own', 'all']).default('own'),
  type: z.enum(['CORRECTION', 'WFH', 'OFFICIAL_DUTY', 'OVERTIME']).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
});

export const GET = api(async (req) => {
  const user = await requireApiUser();
  const filters = parseQuery(ListSchema, query(req));

  const wantsAll = filters.scope === 'all';
  if (wantsAll && !can(user, P.APPROVALS_MANAGE) && !can(user, P.ATTENDANCE_VIEW_ALL)) {
    throw new HttpError(403, 'You can only see your own requests.');
  }

  await connectDB();
  const find = wantsAll ? {} : { userId: user.id };
  if (filters.type) find.type = filters.type;
  if (filters.status) find.status = filters.status;

  const requests = await WorkRequest.find(find).sort({ createdAt: -1 }).limit(300).lean();
  const people = wantsAll
    ? await User.find({ _id: { $in: requests.map((r) => r.userId) } })
        .select('name employeeId')
        .lean()
    : [];
  const byId = new Map(people.map((p) => [String(p._id), p]));

  return json({
    requests: requests.map((r) => serializeRequest(r, { requester: byId.get(String(r.userId)) })),
  });
});

/** Each request type carries a different payload, so each gets its own schema. */
const PAYLOADS = {
  CORRECTION: z.object({
    clockIn: timeString.nullish(),
    clockOut: timeString.nullish(),
    eodMissing: z.boolean().optional(),
  }),
  WFH: z.object({}).optional(),
  OFFICIAL_DUTY: z.object({
    location: z.string().trim().max(200).nullish(),
    fromTime: timeString.nullish(),
    toTime: timeString.nullish(),
  }),
  OVERTIME: z.object({
    minutes: z.coerce.number().int().min(1).max(1440).nullish(),
  }),
};

const SubmitSchema = z
  .object({
    type: z.enum(['CORRECTION', 'WFH', 'OFFICIAL_DUTY', 'OVERTIME']),
    dates: z.array(dateString).min(1, 'Pick at least one date.').max(60),
    reason: z.string().trim().min(5, 'Say why you are asking.').max(1000),
    evidence: asset.nullish(),
    payload: z.unknown().optional(),
  })
  .superRefine((value, ctx) => {
    const schema = PAYLOADS[value.type];
    const parsed = schema.safeParse(value.payload ?? {});
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ code: 'custom', path: ['payload', ...issue.path], message: issue.message });
      }
      return;
    }
    value.payload = parsed.data;
    // A correction or an overtime claim is about one specific day.
    if ((value.type === 'CORRECTION' || value.type === 'OVERTIME') && value.dates.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['dates'],
        message: 'Pick a single date for this request.',
      });
    }
  });

export const POST = api(async (req) => {
  const user = await requireApiPermission(P.REQUEST_SUBMIT);
  const input = parseBody(SubmitSchema, await readJson(req));

  const request = await submitRequest({
    user,
    type: input.type,
    dates: input.dates,
    payload: input.payload ?? {},
    reason: input.reason,
    evidence: input.evidence ?? null,
  });

  await logAudit({
    actorId: user.id,
    action: 'request.submit',
    targetType: 'request',
    targetId: request.id,
    after: { type: request.type, dates: request.dates },
    req,
  });

  return json({ request }, 201);
});
