import { z } from 'zod';
import Holiday from '@/models/workspace/Holiday';
import User from '@/models/workspace/User';
import { settingsCollection, baseTransform } from '@/lib/workspace/services/settings';
import { api, json, readJson } from '@/lib/workspace/route';
import { parseBody, dateString, office } from '@/lib/workspace/validation';
import { requireApiPermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import { getWorkspaceContext, isPeriodLocked } from '@/lib/workspace/context';
import { recomputeDay } from '@/lib/workspace/services/attendance';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  date: dateString,
  name: z.string().trim().min(2, 'Name the holiday.').max(120),
  offices: z.array(office).default([]),
  isClosure: z.boolean().default(false),
  note: z.string().trim().max(400).nullish(),
});

const handlers = settingsCollection({
  model: Holiday,
  name: 'holidays',
  schema: Schema,
  sort: { date: -1 },
  transform: baseTransform,
  // A holiday that was removed should stop being a holiday, so it is deleted
  // outright rather than retired — the audit log keeps the record of it.
  softDelete: false,
});

export const GET = api(handlers.GET);
export const PATCH = api(handlers.PATCH);
export const DELETE = api(handlers.DELETE);

/**
 * Add a holiday and settle the days it changes.
 *
 * Moon-dependent dates such as Eid move at short notice, so adding one has to
 * recalculate any attendance already recorded for that date in an open period.
 * Locked periods are skipped, which is the point of locking them.
 */
export const POST = api(async (req) => {
  const actor = await requireApiPermission(P.SETTINGS_MANAGE);
  const data = parseBody(Schema, await readJson(req));

  await connectDB();
  const created = await Holiday.create({ ...data, createdBy: actor.id });

  const ctx = await getWorkspaceContext();
  // The cached context predates this holiday, so add it for the recompute.
  ctx.holidays.push(created.toObject());

  const affectedOffices = data.offices?.length ? data.offices : ['ISLAMABAD', 'DUBAI'];
  const people = await User.find({ status: 'ACTIVE', office: { $in: affectedOffices } }).lean();

  let recomputed = 0;
  for (const raw of people) {
    const user = { ...raw, id: String(raw._id) };
    if (await isPeriodLocked({ office: user.office, date: data.date, ctx })) continue;
    const touched = await recomputeDay({ user, workDate: data.date, ctx }).catch(() => null);
    if (touched) recomputed += 1;
  }

  await logAudit({
    actorId: actor.id,
    action: 'settings.holidays.create',
    targetType: 'holidays',
    targetId: String(created._id),
    after: baseTransform(created.toObject()),
    meta: { recomputed },
    req,
  });

  return json({ item: baseTransform(created.toObject()), recomputed }, 201);
});
