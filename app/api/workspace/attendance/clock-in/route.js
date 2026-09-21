import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, readJson } from '@/lib/workspace/route';
import { parseBody, position, asset } from '@/lib/workspace/validation';
import { clockIn } from '@/lib/workspace/services/attendance';
import { logAudit, requestMeta } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The browser may say where it is, but never when it is — there is no
 * timestamp in this schema. The server stamps the clock-in itself.
 */
const Schema = z.object({
  position,
  selfie: asset.nullish(),
  reason: z.string().trim().max(400).nullish(),
});

export const POST = api(async (req) => {
  const user = await requireApiPermission(P.ATTENDANCE_SELF);
  const input = parseBody(Schema, await readJson(req));
  const meta = requestMeta(req);

  const result = await clockIn({
    user,
    ip: meta.ip,
    userAgent: meta.userAgent,
    position: input.position ?? null,
    selfie: input.selfie ?? null,
    reason: input.reason ?? null,
  });

  await logAudit({
    actorId: user.id,
    action: 'attendance.clock_in',
    targetType: 'attendance',
    targetId: result.record.id,
    after: { workDate: result.workDate, clockIn: result.record.clockIn },
    meta: { officialDutyPending: result.officialDutyPending },
    req,
  });

  return json(result, 201);
});
