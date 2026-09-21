/**
 * Field-level encryption for the few HR values that are sensitive at rest —
 * national ID numbers (CNIC, Emirates ID) and nothing else.
 *
 * AES-256-GCM, keyed by WORKSPACE_FIELD_KEY. GCM is authenticated, so a value
 * tampered with in the database fails to decrypt rather than returning
 * plausible nonsense. The stored format is `v1:<iv>:<tag>:<ciphertext>`, all
 * base64url, with the version prefix so the scheme can be rotated later.
 *
 * Values are only ever decrypted for the Owner. Everyone else, including the
 * person themselves, sees the masked form.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;

function getKey() {
  const raw = process.env.WORKSPACE_FIELD_KEY;
  if (!raw || raw.length < 32) {
    throw new Error(
      'WORKSPACE_FIELD_KEY must be set and at least 32 characters long to store sensitive ID numbers.'
    );
  }
  // Hashing accepts a passphrase of any length and always yields 32 bytes.
  return createHash('sha256').update(raw).digest();
}

/** True when a key is configured, so callers can degrade gracefully. */
export function isFieldEncryptionConfigured() {
  const raw = process.env.WORKSPACE_FIELD_KEY;
  return Boolean(raw && raw.length >= 32);
}

/** Encrypt a plain string. Returns null for empty input. */
export function encryptField(plain) {
  if (plain == null || plain === '') return null;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

/** Decrypt a stored value. Returns null when absent or unreadable. */
export function decryptField(stored) {
  if (!stored || typeof stored !== 'string') return null;
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(parts[1], 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(parts[3], 'base64url')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    // Wrong key, or the value was tampered with. Never surface a partial read.
    return null;
  }
}

/** "42101-XXXXXXX-3" — enough to confirm the right record, not enough to reuse. */
export function maskIdNumber(plain) {
  if (!plain) return null;
  const value = String(plain).trim();
  if (value.length <= 4) return '•'.repeat(value.length);
  const head = value.slice(0, 2);
  const tail = value.slice(-2);
  return head + '•'.repeat(Math.max(3, value.length - 4)) + tail;
}

/** The masked form of a stored (encrypted) value, without exposing the plaintext. */
export function maskStoredField(stored) {
  const plain = decryptField(stored);
  return plain ? maskIdNumber(plain) : null;
}
