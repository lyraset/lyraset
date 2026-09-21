'use client';

/**
 * The browser's side of the workspace API.
 *
 * Every mutation goes through here so error handling is uniform: the server
 * returns `{ error, issues }`, and this turns that into a thrown Error whose
 * `.issues` a form can map onto its fields. Anything else — a dropped
 * connection, a proxy error page — becomes a message a person can act on
 * rather than "Unexpected token < in JSON".
 */

export class ApiError extends Error {
  constructor(message, { status, issues } = {}) {
    super(message);
    this.status = status;
    this.issues = issues ?? [];
  }
}

async function request(url, options = {}) {
  let res;
  try {
    res = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.');
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    // A session that ended mid-page should land on the login screen, not on a
    // confusing 401 inside a form.
    if (res.status === 401 && typeof window !== 'undefined') {
      window.location.assign('/workspace/login?expired=1');
    }
    throw new ApiError(data?.error || 'Something went wrong. Try again.', {
      status: res.status,
      issues: data?.issues,
    });
  }

  return data ?? {};
}

export const apiGet = (url) => request(url);
export const apiPost = (url, body) =>
  request(url, { method: 'POST', body: JSON.stringify(body ?? {}) });
export const apiPatch = (url, body) =>
  request(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
export const apiDelete = (url) => request(url, { method: 'DELETE' });

/** Turn an ApiError's issues into `{ fieldPath: message }` for a form. */
export function issuesByField(error) {
  const map = {};
  for (const issue of error?.issues ?? []) {
    if (!map[issue.path]) map[issue.path] = issue.message;
  }
  return map;
}

/**
 * Upload a file straight to Cloudinary using a signature from our server.
 * The file never passes through this app, and the stored asset is private.
 */
export async function uploadPrivateFile(file, purpose) {
  const signature = await apiPost('/api/workspace/uploads/sign', { purpose });

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', String(signature.timestamp));
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);
  form.append('type', 'authenticated');

  const endpoint = 'https://api.cloudinary.com/v1_1/' + signature.cloudName + '/auto/upload';
  const res = await fetch(endpoint, { method: 'POST', body: form });
  if (!res.ok) throw new ApiError('That file could not be uploaded. Try a smaller file.');

  const data = await res.json();
  return {
    publicId: data.public_id,
    resourceType: data.resource_type ?? 'image',
    format: data.format ?? null,
    filename: file.name,
    bytes: data.bytes ?? file.size,
  };
}

/** The URL that serves a private asset, signed and short-lived. */
export function assetUrl(publicId, { resourceType = 'image', download = false } = {}) {
  const params = new URLSearchParams({ publicId, resourceType, download: download ? '1' : '0' });
  return '/api/workspace/uploads/view?' + params.toString();
}
