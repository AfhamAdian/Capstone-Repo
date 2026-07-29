import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encodeToken, decodeToken, isExpired } from './survey-token.js';

beforeAll(() => {
  process.env.SURVEY_TOKEN_ENC_KEY = randomBytes(32).toString('base64url');
});

describe('survey-token', () => {
  it('round-trips a valid payload through encode/decode', () => {
    const payload = { bundleId: 42, cycleId: 'manual-abc', deadline: new Date(Date.now() + 60_000).toISOString() };
    const token = encodeToken(payload);
    const decoded = decodeToken(token);

    expect(decoded).toEqual(payload);
  });

  it('produces different ciphertext for the same payload (random IV)', () => {
    const payload = { bundleId: 1, cycleId: 'auto-1-2026-07-r1', deadline: new Date().toISOString() };
    expect(encodeToken(payload)).not.toBe(encodeToken(payload));
  });

  it('rejects a token with a flipped byte instead of throwing', () => {
    const token = encodeToken({ bundleId: 7, cycleId: 'c', deadline: new Date().toISOString() });
    const raw = Buffer.from(token, 'base64url');
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 0xff;
    const tampered = raw.toString('base64url');

    expect(decodeToken(tampered)).toBeNull();
  });

  it('rejects garbage input instead of throwing', () => {
    expect(decodeToken('not-a-real-token')).toBeNull();
    expect(decodeToken('')).toBeNull();
  });

  it('flags a past deadline as expired and a future one as not', () => {
    const past = { bundleId: 1, cycleId: 'c', deadline: new Date(Date.now() - 1000).toISOString() };
    const future = { bundleId: 1, cycleId: 'c', deadline: new Date(Date.now() + 1000).toISOString() };

    expect(isExpired(past)).toBe(true);
    expect(isExpired(future)).toBe(false);
  });
});
