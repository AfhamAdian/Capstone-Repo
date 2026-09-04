import { describe, expect, it } from 'vitest';
import { parseDbTimestamp, toUtcIso } from './db-timestamp.js';

const UTC_INSTANT = Date.UTC(2026, 8, 4, 20, 0, 0);

describe('parseDbTimestamp', () => {
  it('treats an offset-less Postgres timestamp as UTC, not local time', () => {
    // What PostgREST returns for a `timestamp without time zone` column.
    expect(parseDbTimestamp('2026-09-04T20:00:00.000').getTime()).toBe(UTC_INSTANT);
  });

  it('leaves an explicit Z untouched', () => {
    expect(parseDbTimestamp('2026-09-04T20:00:00.000Z').getTime()).toBe(UTC_INSTANT);
  });

  it('leaves a numeric offset untouched, so it stays correct after the timestamptz migration', () => {
    expect(parseDbTimestamp('2026-09-04T20:00:00.000+00:00').getTime()).toBe(UTC_INSTANT);
    expect(parseDbTimestamp('2026-09-05T02:00:00.000+06:00').getTime()).toBe(UTC_INSTANT);
  });

  it('resolves the naive and timestamptz shapes to the same instant', () => {
    expect(parseDbTimestamp('2026-09-04T20:00:00.000').getTime())
      .toBe(parseDbTimestamp('2026-09-04T20:00:00.000+00:00').getTime());
  });
});

describe('toUtcIso', () => {
  it('normalizes a naive timestamp into an unambiguous UTC ISO string', () => {
    expect(toUtcIso('2026-09-04T20:00:00.000')).toBe('2026-09-04T20:00:00.000Z');
  });

  it('passes null and undefined through', () => {
    expect(toUtcIso(null)).toBeNull();
    expect(toUtcIso(undefined)).toBeNull();
  });

  it('returns the raw value when it is unparseable rather than throwing', () => {
    expect(toUtcIso('not-a-date')).toBe('not-a-date');
  });
});
