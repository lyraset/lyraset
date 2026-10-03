import { z } from 'zod';
import { requireApiUser } from '@/lib/workspace/auth';
import { api, json, readJson } from '@/lib/workspace/route';
import { parseBody } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import User from '@/models/workspace/User';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({ acknowledged: z.literal(true) });

/**
 * Record that the employee has seen what the portal collects — location, IP
 * at each clock event. Shown on first
 * login; the timestamp is kept so the acknowledgment is auditable.
 */
export const POST = api(async (req) => {
  const user = await requireApiUser();
  parseBody(Schema, await readJson(req));

  await connectDB();
  const at = new Date();
  await User.updateOne({ _id: user.id }, { $set: { consentAcknowledgedAt: at } });

  await logAudit({
    actorId: user.id,
    action: 'consent.acknowledge',
    targetType: 'user',
    targetId: user.id,
    after: { consentAcknowledgedAt: at },
    req,
  });

  return json({ consentAcknowledgedAt: at });
});
