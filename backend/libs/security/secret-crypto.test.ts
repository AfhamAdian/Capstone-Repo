import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptSecret, decryptSecret } from './secret-crypto.js';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64url');
});

describe('secret-crypto', () => {
  it('round-trips a secret through encrypt/decrypt', () => {
    const secret = 'ghp_exampleGithubToken1234567890';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('produces different ciphertext for the same secret (random IV)', () => {
    expect(encryptSecret('same-token')).not.toBe(encryptSecret('same-token'));
  });

  it('passes through legacy plaintext values unchanged (no migration required)', () => {
    expect(decryptSecret('ghp_legacyPlaintextToken')).toBe('ghp_legacyPlaintextToken');
  });

  it('throws on a tampered ciphertext instead of returning garbage', () => {
    const token = encryptSecret('a-secret-token');
    const raw = Buffer.from(token.slice('enc:v1:'.length), 'base64url');
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 0xff;
    const tampered = 'enc:v1:' + raw.toString('base64url');

    expect(() => decryptSecret(tampered)).toThrow();
  });
});
