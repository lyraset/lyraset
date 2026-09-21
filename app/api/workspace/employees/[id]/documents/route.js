import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission, HttpError } from '@/lib/workspace/auth';
import { api, json, readJson, params, query } from '@/lib/workspace/route';
import { parseBody, parseQuery, objectId, asset } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import User, { DOCUMENT_TYPES } from '@/models/workspace/User';
import { destroyAsset } from '@/lib/workspace/uploads';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const AddSchema = z.object({
  type: z.enum(DOCUMENT_TYPES).default('OTHER'),
  label: z.string().trim().max(120).nullish(),
  asset,
});

/**
 * HR documents (Owner only).
 *
 * The files themselves live in private Cloudinary storage and are only ever
 * served through /api/workspace/uploads/view, which signs a short-lived URL
 * and audits the read. Nothing here returns a public link.
 */
export const POST = api(async (req, context) => {
  const actor = await requireApiPermission(P.EMPLOYEES_MANAGE);
  const { id } = await params(context);
  const input = parseBody(AddSchema, await readJson(req));

  await connectDB();
  const target = await User.findById(id).lean();
  if (!target) throw new HttpError(404, 'That employee no longer has an account.');

  await User.updateOne(
    { _id: target._id },
    {
      $push: {
        documents: {
          type: input.type,
          label: input.label ?? null,
          asset: input.asset,
          uploadedAt: new Date(),
          uploadedBy: actor.id,
        },
      },
    }
  );

  await logAudit({
    actorId: actor.id,
    action: 'document.upload',
    targetType: 'user',
    targetId: String(target._id),
    after: { type: input.type, publicId: input.asset.publicId },
    req,
  });

  const after = await User.findById(target._id).select('documents').lean();
  return json({ documents: after.documents.map(serializeDoc) }, 201);
});

const DeleteSchema = z.object({ documentId: objectId });

export const DELETE = api(async (req, context) => {
  const actor = await requireApiPermission(P.EMPLOYEES_MANAGE);
  const { id } = await params(context);
  const { documentId } = parseQuery(DeleteSchema, query(req));

  await connectDB();
  const target = await User.findById(id).select('documents').lean();
  if (!target) throw new HttpError(404, 'That employee no longer has an account.');

  const document = (target.documents ?? []).find((d) => String(d._id) === documentId);
  if (!document) throw new HttpError(404, 'That document has already been removed.');

  await User.updateOne({ _id: target._id }, { $pull: { documents: { _id: document._id } } });
  // Best effort: a Cloudinary hiccup must not leave a dangling database row.
  await destroyAsset(document.asset?.publicId, document.asset?.resourceType ?? 'image').catch(
    () => null
  );

  await logAudit({
    actorId: actor.id,
    action: 'document.delete',
    targetType: 'user',
    targetId: String(target._id),
    before: { type: document.type, publicId: document.asset?.publicId },
    req,
  });

  const after = await User.findById(target._id).select('documents').lean();
  return json({ documents: (after.documents ?? []).map(serializeDoc) });
});

function serializeDoc(d) {
  return {
    id: String(d._id),
    type: d.type,
    label: d.label ?? null,
    publicId: d.asset?.publicId ?? null,
    resourceType: d.asset?.resourceType ?? 'image',
    filename: d.asset?.filename ?? null,
    uploadedAt: d.uploadedAt ?? null,
  };
}
