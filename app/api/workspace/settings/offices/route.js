import { z } from 'zod';
import Office from '@/models/workspace/Office';
import User, { OFFICES, OFFICE_TIMEZONES } from '@/models/workspace/User';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission, HttpError } from '@/lib/workspace/auth';
import { api, json, readJson } from '@/lib/workspace/route';
import { parseBody } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Office settings: the timezone every calculation for that office runs in, the
 * weekend, and the integrity checks applied at clock-in.
 *
 * There are exactly two offices, created by the seed, so this route edits them
 * rather than offering create and delete.
 */

const Cidr = z
  .string()
  .trim()
  .regex(
    /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?|[0-9a-fA-F:]+(\/\d{1,3})?)$/,
    'Use an IP or a CIDR range, e.g. 203.0.113.0/24'
  );

const Schema = z.object({
  code: z.enum(OFFICES),
  name: z.string().trim().min(2).max(80).optional(),
  timezone: z.string().trim().max(60).optional(),
  // Luxon weekday numbers: 1 is Monday, 7 is Sunday.
  weekendDays: z.array(z.coerce.number().int().min(1).max(7)).max(7).optional(),
  enforceIpAllowlist: z.boolean().optional(),
  ipAllowlist: z.array(Cidr).max(50).optional(),
  enforceGeofence: z.boolean().optional(),
  geofence: z
    .object({
      lat: z.coerce.number().min(-90).max(90).nullish(),
      lng: z.coerce.number().min(-180).max(180).nullish(),
      radiusM: z.coerce.number().int().min(20).max(20000).default(200),
    })
    .optional(),
  selfieRequired: z.boolean().optional(),
  policyNote: z.string().trim().max(2000).nullish(),
});

export const GET = api(async () => {
  await requireApiPermission(P.SETTINGS_MANAGE);
  await connectDB();
  const offices = await Office.find({}).sort({ code: 1 }).lean();
  return json({
    offices: offices.map(({ _id, __v, ...rest }) => ({ id: String(_id), ...rest })),
  });
});

export const PATCH = api(async (req) => {
  const actor = await requireApiPermission(P.SETTINGS_MANAGE);
  const data = parseBody(Schema, await readJson(req));

  await connectDB();
  const before = await Office.findOne({ code: data.code }).lean();

  if (
    data.enforceGeofence &&
    !Number.isFinite(Number(data.geofence?.lat ?? before?.geofence?.lat))
  ) {
    throw new HttpError(
      400,
      'Set the office latitude and longitude before turning the geofence on.'
    );
  }

  const { code, ...set } = data;
  await Office.updateOne(
    { code },
    {
      $set: set,
      $setOnInsert: { code, name: code, timezone: OFFICE_TIMEZONES[code] ?? 'Asia/Karachi' },
    },
    { upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );

  const after = await Office.findOne({ code }).lean();

  // Everyone at the office follows its timezone, so a change has to reach them.
  if (data.timezone && data.timezone !== before?.timezone) {
    await User.updateMany({ office: code }, { $set: { timezone: data.timezone } });
  }

  await logAudit({
    actorId: actor.id,
    action: 'settings.offices.update',
    targetType: 'office',
    targetId: code,
    before: before ?? null,
    after,
    req,
  });

  const { _id, __v, ...rest } = after;
  return json({ office: { id: String(_id), ...rest } });
});
