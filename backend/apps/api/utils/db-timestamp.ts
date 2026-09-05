/**
 * Helpers for reading Postgres timestamp values that arrive over PostgREST.
 *
 * Several columns are `timestamp without time zone` (notably
 * `projectsnapshot.snapshot_time`). We always WRITE them with `toISOString()`, so the
 * stored wall-clock is UTC — but Postgres drops the `Z` on the way in, and PostgREST
 * serializes them back with no offset at all: "2026-09-04T15:35:09.668".
 *
 * `new Date("2026-09-04T15:35:09.668")` is then interpreted as LOCAL time per the ECMAScript
 * spec (offset-less date-TIME forms are local; date-only forms are UTC). On any non-UTC
 * server or browser that silently shifts the instant by the local offset.
 *
 * `parseDbTimestamp` pins the missing offset to UTC. It leaves values that already carry a
 * `Z` or a numeric offset untouched, so it stays correct for `timestamptz` columns and
 * remains correct if a naive column is later migrated to `timestamptz`.
 */

const HAS_EXPLICIT_ZONE = /(?:[Zz]|[+-]\d{2}:?\d{2})$/;

/** Parses a Postgres timestamp string, treating a missing offset as UTC. */
export function parseDbTimestamp(value: string): Date {
  return new Date(HAS_EXPLICIT_ZONE.test(value) ? value : `${value}Z`);
}

/**
 * Normalizes a Postgres timestamp into an unambiguous UTC ISO-8601 string.
 * Use this for any timestamp crossing the API boundary, so clients can parse it with a
 * plain `new Date()` without inheriting the naive-timestamp trap.
 */
export function toUtcIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = parseDbTimestamp(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}
