import { z } from 'zod';
import { P, canManageAccount } from '@/lib/workspace/permissions';
import { requireApiPermission, HttpError } from '@/lib/workspace/auth';
import { api, json, readJson, params } from '@/lib/workspace/route';
import { parseBody } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import User from '@/models/workspace/User';
import { hashPassword, generatePassword, PASSWORD_MIN_LENGTH } from '@/lib/workspace/passwords';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  password: z.string().min(PASSWORD_MIN_LENGTH).max(128).optional(),
});

/**
 * Reset a password (Owner only).
 *
 * The new password comes back exactly once, in this response, and is shown in
 * a modal the Owner copies from. Only the bcrypt hash is stored, so there is
 * no second chance to read it. tokenVersion is bumped, which signs the account
 * out of every device it was already signed in on.
 */
export const POST = api(async (req, context) => {
  const actor = await requireApiPermission(P.EMPLOYEES_MANAGE);
  const { id } = await params(context);
  const input = parseBody(Schema, await readJson(req));

  await connectDB();
  const target = await User.findById(id).lean();
  if (!target) throw new HttpError(404, 'That employee no longer has an account.');
  if (!canManageAccount(actor, { role: target.role, id: String(target._id) })) {
    throw new HttpError(
      403,
      'Owner passwords are reset with scripts/create-owner.mjs --reset, not from the portal.'
    );
  }

  const password = input.password ?? generatePassword();
  await User.updateOne(
    { _id: target._id },
    {
      $set: { passwordHash: await hashPassword(password), failedLoginAttempts: 0, lockUntil: null },
      $inc: { tokenVersion: 1 },
    }
  );

  await logAudit({
    actorId: actor.id,
    action: 'employee.password_reset',
    targetType: 'user',
    targetId: String(target._id),
    meta: { generated: !input.password },
    req,
  });

  return json({
    password: input.password ? null : password,
    generated: !input.password,
    signedOut: true,
  });
});
