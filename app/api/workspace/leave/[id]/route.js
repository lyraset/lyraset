import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, readJson, params } from '@/lib/workspace/route';
import { parseBody } from '@/lib/workspace/validation';
import { cancelLeave } from '@/lib/workspace/services/leave';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  action: z.literal('CANCEL'),
  reason: z.string().trim().max(500).nullish(),
});

/**
 * Cancel your own leave. A pending request is withdrawn; an approved future
 * one goes back for approval so the balance is not released unilaterally.
 */
export const PATCH = api(async (req, context) => {
  const user = await requireApiPermission(P.LEAVE_REQUEST);
  const { id } = await params(context);
  const input = parseBody(Schema, await readJson(req));

  const request = await cancelLeave({ user, requestId: id, reason: input.reason ?? null });

  await logAudit({
    actorId: user.id,
    action: 'leave.cancel',
    targetType: 'leave_request',
    targetId: request.id,
    after: { status: request.status },
    req,
  });

  return json({ request });
});
