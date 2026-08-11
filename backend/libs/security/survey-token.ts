import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * Self-describing encrypted survey link token. The bundle id, cycle id, and
 * deadline are embedded in the ciphertext so both can be read (and the
 * deadline checked) without a DB round-trip, and AES-GCM's auth tag makes
 * tampering with any of those fields fail decode rather than silently succeed.
 */
export interface SurveyTokenPayload {
  bundleId: number;
  cycleId: string;
  deadline: string; // ISO 8601
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended IV size for GCM

function getKey(): Buffer {
  const raw = process.env.SURVEY_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error('SURVEY_TOKEN_ENC_KEY is not configured');
  }
  const key = Buffer.from(raw, 'base64url');
  if (key.length !== 32) {
    throw new Error('SURVEY_TOKEN_ENC_KEY must decode to exactly 32 bytes (AES-256)');
  }
  return key;
}

export function encodeToken(payload: SurveyTokenPayload): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64url');
}

/**
 * Never throws — returns null for any malformed, tampered, or undecryptable
 * token so callers can treat it as a plain "invalid link" without a try/catch.
 */
export function decodeToken(token: string): SurveyTokenPayload | null {
  try {
    const key = getKey();
    const raw = Buffer.from(token, 'base64url');
    if (raw.length < IV_LENGTH + 16) return null; // IV + GCM auth tag minimum

    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
    const ciphertext = raw.subarray(IV_LENGTH + 16);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    const parsed = JSON.parse(plaintext.toString('utf8'));
    if (
      !Number.isInteger(parsed?.bundleId) ||
      parsed.bundleId <= 0 ||
      typeof parsed?.cycleId !== 'string' ||
      parsed.cycleId.length === 0 ||
      parsed.cycleId.length > 200 ||
      typeof parsed?.deadline !== 'string' ||
      !Number.isFinite(new Date(parsed.deadline).getTime())
    ) {
      return null;
    }
    return parsed as SurveyTokenPayload;
  } catch {
    return null;
  }
}

export function isExpired(payload: SurveyTokenPayload, now: Date = new Date()): boolean {
  return new Date(payload.deadline).getTime() <= now.getTime();
}
