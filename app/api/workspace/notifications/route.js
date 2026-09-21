import { z } from 'zod';
import { requireApiUser } from '@/lib/workspace/auth';
import { api, json, readJson } from '@/lib/workspace/route';
import { parseBody, objectId } from '@/lib/workspace/validation';
import { listNotifications, unreadCount, markRead } from '@/lib/workspace/services/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The bell: recent notifications and the unread count. */
export const GET = api(async () => {
  const user = await requireApiUser();
  const [notifications, unread] = await Promise.all([
    listNotifications(user.id),
    unreadCount(user.id),
  ]);
  return json({ notifications, unread });
});

const Schema = z.object({
  action: z.literal('MARK_READ'),
  id: objectId.nullish(),
});

/** Mark one notification, or all of them, as read. */
export const POST = api(async (req) => {
  const user = await requireApiUser();
  const input = parseBody(Schema, await readJson(req));
  const updated = await markRead(user.id, { id: input.id ?? null });
  return json({ updated, unread: await unreadCount(user.id) });
});
