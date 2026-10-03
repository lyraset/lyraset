import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, readJson } from '@/lib/workspace/route';
import { parseBody, objectId, dateString } from '@/lib/workspace/validation';
import {
  decideLeave,
  approveCancellation,
  rejectCancellation,
} from '@/lib/workspace/services/leave';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  requestId: objectId,
  decision: z.enum(['APPROVE', 'REJECT', 'APPROVE_CANCELLATION', 'REJECT_CANCELLATION']),
  approvedDates: z.array(dateString).max(400).nullish(),
  comment: z.string().trim().max(1000).nullish(),
});

/**
 * Approve, partially approve or reject a leave request, or decide a request
 * to cancel leave that was already approved.
 * canApprove decides who may act, so nobody approves their own leave and the
 * Owner's requests reach only the CEO.
 */
export const POST = api(async (req) => {
  const approver = await requireApiPermission(P.APPROVALS_MANAGE);
  const input = parseBody(Schema, await readJson(req));
  const comment = input.comment ?? null;

  let request;
  if (input.decision === 'APPROVE_CANCELLATION') {
    request = await approveCancellation({ approver, requestId: input.requestId, comment });
  } else if (input.decision === 'REJECT_CANCELLATION') {
    request = await rejectCancellation({ approver, requestId: input.requestId, comment });
  } else {
    request = await decideLeave({
      approver,
      requestId: input.requestId,
      decision: input.decision,
      approvedDates: input.approvedDates ?? null,
      comment,
    });
  }

  await logAudit({
    actorId: approver.id,
    action: 'leave.' + input.decision.toLowerCase(),
    targetType: 'leave_request',
    targetId: request.id,
    after: {
      status: request.status,
      approvedDates: request.approvedDates,
      paidDays: request.paidDays,
    },
    meta: { comment: input.comment ?? null },
    req,
  });

  return json({ request });
});
