import { z } from 'zod';
import { NextResponse } from 'next/server';

/**
 * Shared zod pieces for workspace input.
 *
 * Every API handler and server action validates through these before touching
 * the database. Validated output is always primitives — a string id, a number,
 * a date string — so a request body object can never reach a Mongo query and
 * smuggle in an operator.
 */

/** A 24-character hex ObjectId, as a string. */
export const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'That is not a valid id.');

/** A calendar date, 'YYYY-MM-DD'. The portal's dates are labels, not instants. */
export const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format.');

/** A wall-clock time, 'HH:mm'. */
export const timeString = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time in HH:mm format.');

export const office = z.enum(['ISLAMABAD', 'DUBAI']);

/** A browser geolocation reading. Never trusted for time, only for place. */
export const position = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyM: z.number().min(0).max(100000).optional(),
  })
  .nullable()
  .optional();

/** A private Cloudinary asset the browser has already uploaded. */
export const asset = z.object({
  publicId: z.string().trim().min(1).max(300),
  resourceType: z.enum(['image', 'video', 'raw']).default('image'),
  format: z.string().trim().max(20).nullish(),
  filename: z.string().trim().max(200).nullish(),
  bytes: z.number().int().min(0).max(50_000_000).nullish(),
});

/** Paging for list endpoints. */
export const paging = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Parse a request body, or throw a response-shaped error the route can return.
 * Field-level problems come back with their path so a form can point at them.
 */
export function parseBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  throw new ValidationError(parsed.error);
}

/** Parse URL search params the same way. */
export function parseQuery(schema, searchParams) {
  const raw = {};
  for (const [key, value] of searchParams.entries()) {
    // Repeated keys (?office=A&office=B) arrive as an array.
    if (key in raw) raw[key] = [].concat(raw[key], value);
    else raw[key] = value;
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new ValidationError(parsed.error);
}

/**
 * Make a user's search text safe to use inside a Mongo $regex.
 *
 * Without this, a search for "a.b" would match "axb", and a search containing
 * a quantifier could be made expensive on purpose. Escaping keeps a search box
 * a search box.
 */
export function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class ValidationError extends Error {
  constructor(zodError) {
    super('Some fields need fixing.');
    this.status = 400;
    this.issues = zodError.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
  }
}

/** Render a ValidationError as the API's standard 400. */
export function validationResponse(err) {
  return NextResponse.json({ error: err.message, issues: err.issues }, { status: 400 });
}
