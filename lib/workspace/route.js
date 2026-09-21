import { NextResponse } from 'next/server';
import { handleApiError, HttpError } from './auth.js';
import { readJson as _readJson } from './json.js';

/**
 * Boilerplate for workspace API routes.
 *
 * Every handler is wrapped so a thrown HttpError, a zod failure or a duplicate
 * key comes back as the right status with a message a person can act on,
 * instead of a 500. Handlers therefore throw rather than assembling responses
 * for their failure paths.
 *
 * Workspace routes always run on Node (Mongoose) and are never cached, so the
 * segment config below is re-exported by each route file.
 */

export const routeConfig = {
  dynamic: 'force-dynamic',
  runtime: 'nodejs',
};

export function api(handler) {
  return async (req, context) => {
    try {
      return await handler(req, context);
    } catch (err) {
      return handleApiError(err);
    }
  };
}

export const json = (data, status = 200) => NextResponse.json(data, { status });

export const ok = (data = {}) => json({ ok: true, ...data });

export { HttpError };
export const readJson = _readJson;

/** Await a route's dynamic params, which are a promise in Next 15. */
export async function params(context) {
  return (await context?.params) ?? {};
}

/** Search params of the current request. */
export function query(req) {
  return new URL(req.url).searchParams;
}

/**
 * Verify a cron request's bearer secret.
 *
 * Cron routes are the one place a session is not required, so the secret is
 * the whole of the authentication and a missing CRON_SECRET must fail closed
 * rather than letting everything through.
 */
export function requireCronSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new HttpError(503, 'CRON_SECRET is not configured, so scheduled jobs are disabled.');
  }
  const header = req.headers.get('authorization') ?? '';
  if (header !== 'Bearer ' + secret) {
    throw new HttpError(401, 'Invalid cron credentials.');
  }
}
