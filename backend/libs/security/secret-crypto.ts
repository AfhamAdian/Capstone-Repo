import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * Field-level encryption for credentials stored at rest: VCS PATs (workspace.access_token) and the
 * Jira/SonarQube token + Jira account email kept in projecttoolintegration.config.
 *
 * Keyed by ENCRYPTION_KEY (AES-256-GCM, base64url, 32 bytes decoded) — separate from
 * SURVEY_TOKEN_ENC_KEY (survey links) so the two can be rotated independently.
 *
 * Encrypted values are tagged with ENC_PREFIX so rows written before this existed (plaintext) stay
 * readable: decryptSecret returns anything without the prefix unchanged instead of throwing, so no
 * backfill/migration is required — rows encrypt themselves the next time they're written.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended IV size for GCM
const AUTH_TAG_LENGTH = 16;
const ENC_PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY is not configured');
  }
  const key = Buffer.from(raw, 'base64url');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256)');
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString('base64url');
}

/** Values written before encryption was added (no ENC_PREFIX) are returned unchanged, not rejected. */
export function decryptSecret(value: string): string {
  if (!value.startsWith(ENC_PREFIX)) {
    return value;
  }
  const key = getKey();
  const raw = Buffer.from(value.slice(ENC_PREFIX.length), 'base64url');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
