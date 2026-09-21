import { z } from 'zod';
import { P, canManageAccount } from '@/lib/workspace/permissions';
import { requireApiPermission, HttpError } from '@/lib/workspace/auth';
import { api, json, readJson, params } from '@/lib/workspace/route';
import { parseBody, dateString } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import User, { toSafeUser, EXIT_TYPES } from '@/models/workspace/User';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
  exitDate: dateString.nullish(),
  exitType: z.enum(EXIT_TYPES).nullish(),
  reason: z.string().trim().max(500).nullish(),
});

/**
 * Deactivate or reactivate an account (Owner only).
 *
 * Nothing is ever hard-deleted: a deactivated account keeps all of its
 * attendance, EODs and leave history, it simply cannot sign in. Deactivating
 * bumps tokenVersion so any open session ends at once.
 */
export const POST = api(async (req, context) => {
  const actor = await requireApiPermission(P.EMPLOYEES_MANAGE);
  const { id } = await params(context);
  const input = parseBody(Schema, await readJson(req));

  await connectDB();
  const target = await User.findById(id).lean();
  if (!target) throw new HttpError(404, 'That employee no longer has an account.');
  if (!canManageAccount(actor, { role: target.role, id: String(target._id) })) {
    throw new HttpError(403, 'Owner accounts cannot be deactivated from the portal.');
  }

  const set = { status: input.status };
  if (input.status === 'INACTIVE') {
    set.exitDate = input.exitDate ? new Date(input.exitDate) : new Date();
    if (input.exitType) set.exitType = input.exitType;
  } else {
    set.exitDate = null;
    set.exitType = null;
  }

  await User.updateOne({ _id: target._id }, { $set: set, $inc: { tokenVersion: 1 } });
  const after = await User.findById(target._id).lean();

  await logAudit({
    actorId: actor.id,
    action: input.status === 'ACTIVE' ? 'employee.reactivate' : 'employee.deactivate',
    targetType: 'user',
    targetId: String(target._id),
    before: { status: target.status, exitDate: target.exitDate ?? null },
    after: {
      status: after.status,
      exitDate: after.exitDate ?? null,
      exitType: after.exitType ?? null,
    },
    meta: { reason: input.reason ?? null },
    req,
  });

  return json({ user: toSafeUser(after) });
});
