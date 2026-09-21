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
