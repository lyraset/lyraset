import { z } from 'zod';
import { P, can } from '@/lib/workspace/permissions';
import { requireApiUser, HttpError } from '@/lib/workspace/auth';
import { api, query } from '@/lib/workspace/route';
import { parseQuery } from '@/lib/workspace/validation';
import { signedAssetUrl, UPLOAD_FOLDERS } from '@/lib/workspace/uploads';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  publicId: z.string().trim().min(1).max(300),
  resourceType: z.enum(['image', 'video', 'raw']).default('image'),
  download: z.enum(['0', '1']).default('0'),
});

/**
 * Redirect to a short-lived signed URL for a private asset.
 *
 * Permission is decided by which folder the asset lives in, which is set at
 * upload time and cannot be changed by the caller: HR documents are the
 * Owner's alone, the rest need only a session. Reads of HR documents are
 * audited, because who looked at someone's contract matters.
 */
export const GET = api(async (req) => {
  const user = await requireApiUser();
  const { publicId, resourceType, download } = parseQuery(Schema, query(req));

  const isPrivateHr = publicId.startsWith(UPLOAD_FOLDERS.DOCUMENT);
  if (isPrivateHr && !can(user, P.EMPLOYEES_MANAGE)) {
    throw new HttpError(403, 'Only the Owner can open this file.');
  }

  const url = signedAssetUrl(publicId, { resourceType, download: download === '1' });
  if (!url) throw new HttpError(404, 'That file is not available.');

  if (isPrivateHr) {
    await logAudit({
      actorId: user.id,
      action: 'document.view',
      targetType: 'asset',
      targetId: publicId,
      req,
    });
  }

  return Response.redirect(url, 307);
});
