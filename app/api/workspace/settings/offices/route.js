import { z } from 'zod';
import Office from '@/models/workspace/Office';
import { OFFICES } from '@/models/workspace/User';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission, HttpError } from '@/lib/workspace/auth';
import { api, json, readJson } from '@/lib/workspace/route';
import { parseBody } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Office settings: the weekend and the integrity checks applied at clock-in.
 *
 * There is one office, in Pakistan, so this route edits it rather than
 * offering create and delete. It has no timezone setting: the portal always
 * runs on Pakistan time.
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
  // A path may appear in only one operator, so the default name is written on
  // insert only when the form did not send one. The settings form always does.
  const update = { $set: set };
  if (!set.name) update.$setOnInsert = { name: 'Islamabad' };
  await Office.updateOne({ code }, update, {
    upsert: true,
    setDefaultsOnInsert: true,
    runValidators: true,
  });

  const after = await Office.findOne({ code }).lean();

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
