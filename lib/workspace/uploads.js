import 'server-only';
import { getCloudinary, isCloudinaryConfigured } from '../cloudinary.js';

/**
 * Private file storage for the workspace.
 *
 * HR documents, leave certificates, EOD attachments and clock-in selfies are
 * uploaded with `type: authenticated`, which means Cloudinary will not serve
 * them from a guessable URL. They are delivered only through short-lived signed
 * URLs minted here, for a user the server has already authorised.
 *
 * The API secret never leaves the server: the browser uploads directly to
 * Cloudinary using a signature this module produces.
 */

export const UPLOAD_FOLDERS = Object.freeze({
  DOCUMENT: 'lyraset/workspace/documents',
  SELFIE: 'lyraset/workspace/selfies',
  EOD: 'lyraset/workspace/eod',
  LEAVE: 'lyraset/workspace/leave',
  PHOTO: 'lyraset/workspace/photos',
});

/** How long a delivery URL stays valid. Long enough to load a page, short enough not to leak. */
const SIGNED_URL_TTL_SECONDS = 300;

export { isCloudinaryConfigured };

/**
 * Parameters the browser posts to Cloudinary, signed here so the secret stays
 * on the server. `type: authenticated` is what makes the asset private.
 *
 * @param {object} args
 * @param {string} args.folder - one of UPLOAD_FOLDERS
 * @param {string} [args.publicId] - omit to let Cloudinary generate one
 * @returns {{cloudName:string,apiKey:string,timestamp:number,signature:string,folder:string,type:string}}
 */
export function createSignedUpload({ folder, publicId = undefined }) {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, _API_KEY and _API_SECRET.'
    );
  }
  const cld = getCloudinary();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { folder, timestamp, type: 'authenticated' };
  if (publicId) params.public_id = publicId;

  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    timestamp,
    folder,
    type: 'authenticated',
    ...(publicId ? { publicId } : {}),
    signature: cld.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET),
  };
}

/**
 * A signed, expiring URL for a private asset.
 * Returns null when Cloudinary is not configured, so callers can degrade to
 * "file unavailable" rather than crashing a page.
 */
export function signedAssetUrl(
  publicId,
  { resourceType = 'image', ttlSeconds = SIGNED_URL_TTL_SECONDS, download = false } = {}
) {
  if (!publicId || !isCloudinaryConfigured()) return null;
  const cld = getCloudinary();
  return cld.url(publicId, {
    resource_type: resourceType,
    type: 'authenticated',
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
    ...(download ? { flags: 'attachment' } : {}),
  });
}

/** Remove a private asset. Used when the Owner deletes an HR document. */
export async function destroyAsset(publicId, resourceType = 'image') {
  if (!publicId || !isCloudinaryConfigured()) return null;
  const cld = getCloudinary();
  return cld.uploader.destroy(publicId, {
    resource_type: resourceType,
    type: 'authenticated',
    invalidate: true,
  });
}

/** Attach a fresh signed URL to each asset in a list, for rendering. */
export function withSignedUrls(assets, options = {}) {
  return (assets ?? []).map((asset) => ({
    ...asset,
    url: signedAssetUrl(asset.publicId, {
      resourceType: asset.resourceType ?? 'image',
      ...options,
    }),
  }));
}
