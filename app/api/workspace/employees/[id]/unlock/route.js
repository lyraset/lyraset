import { P, canManageAccount } from '@/lib/workspace/permissions';
import { requireApiPermission, HttpError } from '@/lib/workspace/auth';
import { api, json, params } from '@/lib/workspace/route';
import { connectDB } from '@/lib/workspace/db';
import User from '@/models/workspace/User';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Clear a lockout before its 15 minutes are up (Owner only). */
export const POST = api(async (req, context) => {
  const actor = await requireApiPermission(P.EMPLOYEES_MANAGE);
  const { id } = await params(context);

  await connectDB();
  const target = await User.findById(id).lean();
  if (!target) throw new HttpError(404, 'That employee no longer has an account.');
  if (!canManageAccount(actor, { role: target.role, id: String(target._id) })) {
    throw new HttpError(403, 'Owner accounts cannot be changed from the portal.');
  }

  await User.updateOne({ _id: target._id }, { $set: { failedLoginAttempts: 0, lockUntil: null } });

  await logAudit({
    actorId: actor.id,
    action: 'employee.unlock',
    targetType: 'user',
    targetId: String(target._id),
    req,
  });

  return json({ unlocked: true });
});
