import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, readJson, params } from '@/lib/workspace/route';
import { parseBody } from '@/lib/workspace/validation';
import { cancelRequest } from '@/lib/workspace/services/requests';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({ action: z.literal('CANCEL') });

/** Withdraw your own pending request. */
export const PATCH = api(async (req, context) => {
  const user = await requireApiPermission(P.REQUEST_SUBMIT);
  const { id } = await params(context);
  parseBody(Schema, await readJson(req));

  const request = await cancelRequest({ user, requestId: id });

  await logAudit({
    actorId: user.id,
    action: 'request.cancel',
    targetType: 'request',
    targetId: request.id,
    after: { status: request.status },
    req,
  });

  return json({ request });
});
