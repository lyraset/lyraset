/**
 * Server-side guards. These are the real enforcement layer — middleware is only
 * the first gate. Call one of these at the top of EVERY workspace page, layout,
 * server action and API handler.
 */
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { connectDB } from './db.js';
import User, { toSafeUser } from '../../models/workspace/User.js';
import { SESSION_COOKIE, verifySessionToken } from './session.js';
import { can, canApprove, getPermissions } from './permissions.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Current user, re-validated against the DB (active, role, tokenVersion). Deduped per request. */
export const getCurrentUser = cache(async () => {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  await connectDB();
  const user = await User.findById(session.id).lean();
  if (!user || user.status !== 'ACTIVE') return null;
  if ((user.tokenVersion ?? 0) !== session.tokenVersion) return null; // password reset, deactivation, role change

  const safe = toSafeUser(user);
  return { ...safe, permissions: [...getPermissions(safe)] };
});

// ---- Pages / layouts / server actions ----
export async function requirePageUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/workspace/login?expired=1');
  return user;
}

export async function requirePagePermission(permission) {
  const user = await requirePageUser();
  if (!can(user, permission)) redirect('/workspace?denied=1');
  return user;
}

// ---- API route handlers ----
export async function requireApiUser() {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, 'Your session has ended. Sign in again.');
  return user;
}

export async function requireApiPermission(permission) {
  const user = await requireApiUser();
  if (!can(user, permission)) throw new HttpError(403, "You don't have permission to do this.");
  return user;
}

export function assertCanApprove(approver, requester) {
  if (!canApprove(approver, requester)) {
    throw new HttpError(403, "You can't approve this request.");
  }
}

export function handleApiError(err) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // A zod failure from lib/workspace/validation.js: report which fields broke
  // so the form can point at them instead of showing one vague message.
  if (Array.isArray(err?.issues) && Number.isInteger(err?.status)) {
    return NextResponse.json({ error: err.message, issues: err.issues }, { status: err.status });
  }
  // A duplicate key means the caller raced someone else to a unique value.
  if (err?.code === 11000) {
    return NextResponse.json({ error: 'That value is already in use.' }, { status: 409 });
  }
  console.error('[workspace api]', err);
  return NextResponse.json({ error: 'Something went wrong on the server.' }, { status: 500 });
}
