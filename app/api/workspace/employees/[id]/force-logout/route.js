import { P, canManageAccount } from '@/lib/workspace/permissions';
import { requireApiPermission, HttpError } from '@/lib/workspace/auth';
import { api, json, params } from '@/lib/workspace/route';
import { connectDB } from '@/lib/workspace/db';
import User from '@/models/workspace/User';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Sign an account out everywhere (Owner only).
 *
 * Bumping tokenVersion is enough: every guard compares the token's version
 * against the database on each request, so existing cookies stop validating
 * immediately rather than at their 12-hour expiry.
 */
export const POST = api(async (req, context) => {
  const actor = await requireApiPermission(P.EMPLOYEES_MANAGE);
  const { id } = await params(context);

  await connectDB();
  const target = await User.findById(id).lean();
  if (!target) throw new HttpError(404, 'That employee no longer has an account.');
  if (!canManageAccount(actor, { role: target.role, id: String(target._id) })) {
    throw new HttpError(403, 'Owner accounts cannot be changed from the portal.');
  }

  await User.updateOne({ _id: target._id }, { $inc: { tokenVersion: 1 } });

  await logAudit({
    actorId: actor.id,
    action: 'employee.force_logout',
    targetType: 'user',
    targetId: String(target._id),
    req,
  });

  return json({ signedOut: true });
});
