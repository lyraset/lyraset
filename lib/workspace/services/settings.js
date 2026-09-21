import 'server-only';
import { P } from '../permissions.js';
import { requireApiPermission, HttpError } from '../auth.js';
import { json, readJson, query } from '../route.js';
import { parseBody, parseQuery, objectId } from '../validation.js';
import { connectDB } from '../db.js';
import { logAudit } from '../audit.js';
import { z } from 'zod';

/**
 * The settings collections are all the same shape: the Owner lists them,
 * creates one, edits one, and retires one by clearing `active` rather than
 * deleting it — historical records keep pointing at something real.
 *
 * Rather than nine near-identical route files, each one declares its model and
 * its zod schema and gets the handlers from here. Every write is audited with
 * before and after values.
 */

export function settingsCollection({
  model,
  name,
  schema,
  // A schema wrapped in .superRefine() is a ZodEffects and has no .partial(),
  // so a collection that cross-checks fields passes its own patch schema.
  patchSchema = typeof schema.partial === 'function' ? schema.partial() : schema,
  sort = { name: 1 },
  transform = (x) => x,
  softDelete = true,
}) {
  const idQuery = z.object({ id: objectId });

  const GET = async () => {
    await requireApiPermission(P.SETTINGS_MANAGE);
    await connectDB();
    const rows = await model.find({}).sort(sort).lean();
    return json({ [name]: rows.map(transform) });
  };

  const POST = async (req) => {
    const actor = await requireApiPermission(P.SETTINGS_MANAGE);
    const data = parseBody(schema, await readJson(req));
    await connectDB();

    let created;
    try {
      created = await model.create(data);
    } catch (err) {
      if (err?.code === 11000)
        throw new HttpError(409, 'One with that name or code already exists.');
      throw err;
    }

    await logAudit({
      actorId: actor.id,
      action: 'settings.' + name + '.create',
      targetType: name,
      targetId: String(created._id),
      after: transform(created.toObject()),
      req,
    });

    return json({ item: transform(created.toObject()) }, 201);
  };

  const PATCH = async (req) => {
    const actor = await requireApiPermission(P.SETTINGS_MANAGE);
    const body = (await readJson(req)) ?? {};
    const { id } = parseBody(idQuery, { id: body.id });
    const data = parseBody(patchSchema, body);
    delete data.id;

    await connectDB();
    const before = await model.findById(id).lean();
    if (!before) throw new HttpError(404, 'That item no longer exists.');

    try {
      await model.updateOne({ _id: id }, { $set: data }, { runValidators: true });
    } catch (err) {
      if (err?.code === 11000)
        throw new HttpError(409, 'One with that name or code already exists.');
      throw err;
    }
    const after = await model.findById(id).lean();

    await logAudit({
      actorId: actor.id,
      action: 'settings.' + name + '.update',
      targetType: name,
      targetId: String(id),
      before: transform(before),
      after: transform(after),
      req,
    });

    return json({ item: transform(after) });
  };

  const DELETE = async (req) => {
    const actor = await requireApiPermission(P.SETTINGS_MANAGE);
    const { id } = parseQuery(idQuery, query(req));

    await connectDB();
    const before = await model.findById(id).lean();
    if (!before) throw new HttpError(404, 'That item no longer exists.');

    if (softDelete) {
      // Retiring keeps every historical reference valid.
      await model.updateOne({ _id: id }, { $set: { active: false } });
    } else {
      await model.deleteOne({ _id: id });
    }

    await logAudit({
      actorId: actor.id,
      action: 'settings.' + name + (softDelete ? '.retire' : '.delete'),
      targetType: name,
      targetId: String(id),
      before: transform(before),
      req,
    });

    return json({ retired: softDelete, deleted: !softDelete });
  };

  return { GET, POST, PATCH, DELETE };
}

/** Every settings model gets the same id-and-timestamps shape on the way out. */
export function baseTransform(doc) {
  if (!doc) return null;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id), ...rest };
}
