import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, readJson } from '@/lib/workspace/route';
import { parseBody, objectId } from '@/lib/workspace/validation';
import { decideRequest } from '@/lib/workspace/services/requests';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  requestId: objectId,
  decision: z.enum(['APPROVE', 'REJECT']),
  comment: z.string().trim().max(1000).nullish(),
});

/**
 * Decide a correction, WFH, official duty or overtime request.
 * Leave requests go through /api/workspace/leave/decide, which also has to
 * move balances; everything else settles here.
 */
export const POST = api(async (req) => {
  const approver = await requireApiPermission(P.APPROVALS_MANAGE);
  const input = parseBody(Schema, await readJson(req));

  const request = await decideRequest({
    approver,
    requestId: input.requestId,
    decision: input.decision,
    comment: input.comment ?? null,
    req,
  });

  return json({ request });
});
