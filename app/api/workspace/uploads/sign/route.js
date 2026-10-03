import { z } from 'zod';
import { P, can } from '@/lib/workspace/permissions';
import { requireApiUser, HttpError } from '@/lib/workspace/auth';
import { api, json, readJson } from '@/lib/workspace/route';
import { parseBody } from '@/lib/workspace/validation';
import {
  createSignedUpload,
  UPLOAD_FOLDERS,
  isCloudinaryConfigured,
} from '@/lib/workspace/uploads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Which permission each upload kind needs, so a signature cannot be repurposed. */
const PURPOSES = {
  EOD: { folder: UPLOAD_FOLDERS.EOD, permission: P.EOD_SUBMIT },
  LEAVE: { folder: UPLOAD_FOLDERS.LEAVE, permission: P.LEAVE_REQUEST },
  REQUEST: { folder: UPLOAD_FOLDERS.LEAVE, permission: P.REQUEST_SUBMIT },
  DOCUMENT: { folder: UPLOAD_FOLDERS.DOCUMENT, permission: P.EMPLOYEES_MANAGE },
  PHOTO: { folder: UPLOAD_FOLDERS.PHOTO, permission: P.EMPLOYEES_MANAGE },
};

const Schema = z.object({ purpose: z.enum(Object.keys(PURPOSES)) });

/**
 * Hand the browser a signed, single-use upload ticket.
 *
 * Everything uploaded here is `type: authenticated`, so it is never reachable
 * from a guessable URL — reading it back always goes through /uploads/view,
 * which checks who is asking.
 */
export const POST = api(async (req) => {
  const user = await requireApiUser();
  const { purpose } = parseBody(Schema, await readJson(req));

  if (!isCloudinaryConfigured()) {
    throw new HttpError(
      503,
      'File uploads are not configured yet. Ask the Owner to add the Cloudinary keys.'
    );
  }

  const rule = PURPOSES[purpose];
  if (!can(user, rule.permission)) {
    throw new HttpError(403, "You don't have permission to upload this.");
  }

  return json(createSignedUpload({ folder: rule.folder }));
});
