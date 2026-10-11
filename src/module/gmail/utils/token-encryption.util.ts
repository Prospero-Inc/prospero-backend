import * as crypto from 'crypto';

/**
 * AES-256-GCM encryption for Gmail access/refresh tokens at rest.
 *
 * GCM is authenticated encryption (AEAD): `decryptToken` throws instead of
 * silently returning garbage if the stored string was truncated/corrupted/
 * edited by hand (e.g. a bad data migration) — important for data as
 * sensitive as a Gmail refresh token.
 *
 * Packed format: `base64(iv).base64(authTag).base64(ciphertext)`, a single
 * string with `.` separators (not JSON — shorter in the column, no extra
 * `JSON.parse`). This format is internal to this module and never exposed
 * outside of it.
 *
 * `GMAIL_TOKEN_ENCRYPTION_KEY` must be 32 random bytes, base64-encoded
 * (`openssl rand -base64 32`), so it's an ASCII-safe env var value.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96 bits, recommended size for GCM

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((b) => b.toString('base64')).join('.');
}

export function decryptToken(packed: string): string {
  const [ivB64, authTagB64, ciphertextB64] = packed.split('.');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Malformed encrypted token payload');
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

function getEncryptionKey(): Buffer {
  const raw = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY is not set');
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'GMAIL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes',
    );
  }

  return key;
}
