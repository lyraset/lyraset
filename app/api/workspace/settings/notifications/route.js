import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, readJson } from '@/lib/workspace/route';
import { parseBody } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import Settings, { SINGLETON_KEY } from '@/models/workspace/Settings';
import { ensureSettings } from '@/lib/workspace/context';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  autoClockOutNotice: z.boolean().optional(),
  requestDecision: z.boolean().optional(),
  approverPending: z.boolean().optional(),
  email: z.boolean().optional(),
});

export const GET = api(async () => {
  await requireApiPermission(P.SETTINGS_MANAGE);
  const settings = await ensureSettings();
  return json({
    notifications: settings.notifications ?? {},
    emailConfigured: Boolean(process.env.RESEND_API_KEY),
  });
});

/** Turn each kind of notification on or off. Account notices are always sent. */
export const PATCH = api(async (req) => {
  const actor = await requireApiPermission(P.SETTINGS_MANAGE);
  const data = parseBody(Schema, await readJson(req));

  await connectDB();
  const before = await ensureSettings();

  const set = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) set['notifications.' + key] = value;
  }
  await Settings.updateOne({ key: SINGLETON_KEY }, { $set: { ...set, updatedBy: actor.id } });
  const after = await Settings.findOne({ key: SINGLETON_KEY }).lean();

  await logAudit({
    actorId: actor.id,
    action: 'settings.notifications.update',
    targetType: 'settings',
    targetId: SINGLETON_KEY,
    before: before.notifications ?? null,
    after: after.notifications ?? null,
    req,
  });

  return json({ notifications: after.notifications ?? {} });
});
