import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, readJson } from '@/lib/workspace/route';
import { parseBody, dateString, objectId } from '@/lib/workspace/validation';
import { quoteLeave } from '@/lib/workspace/services/leave';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  leaveTypeId: objectId,
  from: dateString,
  to: dateString,
  halfDay: z.boolean().default(false),
  hours: z.coerce.number().min(0.5).max(8).nullish(),
  hasDocument: z.boolean().default(false),
});

/**
 * Price a request before it is submitted, so the form can show exactly what it
 * will cost and how many paid days are left, rather than guessing.
 */
export const POST = api(async (req) => {
  const user = await requireApiPermission(P.LEAVE_REQUEST);
  const input = parseBody(Schema, await readJson(req));
  const quote = await quoteLeave({ user, ...input });
  return json(quote);
});
