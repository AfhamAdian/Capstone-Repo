import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeActionSearchQuery, type ActionRow, type ActionSearchRow } from '../apps/api/database/actions.js';
import { fuseActionSearchResults } from '../apps/api/services/action-search.service.js';
import { isValidDateOnly } from '../apps/api/controllers/actions.controller.js';

function row(id: string, date: string): ActionRow {
  return {
    id,
    project_ids: ['project-a'],
    problem: `Problem ${id}`,
    reason: `Reason ${id}`,
    action_taken: `Action ${id}`,
    action_date: date,
    effectiveness: null,
    logged_by: 'tester',
    created_at: `${date}T00:00:00.000Z`,
  };
}

test('sanitizeActionSearchQuery removes PostgREST control characters', () => {
  assert.equal(sanitizeActionSearchQuery('  velocity%,_(drop)  '), 'velocity drop');
  assert.equal(sanitizeActionSearchQuery('%_,()\\'), '');
});

test('isValidDateOnly rejects impossible dates', () => {
  assert.equal(isValidDateOnly('2026-08-22'), true);
  assert.equal(isValidDateOnly('2026-02-30'), false);
  assert.equal(isValidDateOnly('2026-13-01'), false);
  assert.equal(isValidDateOnly('22-08-2026'), false);
});

test('hybrid RRF promotes rows present in semantic and lexical results', () => {
  const semantic: ActionSearchRow[] = [
    { ...row('semantic-only', '2026-08-20'), similarity: 0.91 },
    { ...row('both', '2026-08-19'), similarity: 0.82 },
  ];
  const lexical: ActionRow[] = [row('both', '2026-08-19'), row('lexical-only', '2026-08-22')];

  const result = fuseActionSearchResults(semantic, lexical, 3);
  assert.equal(result[0]?.id, 'both');
  assert.equal(result.length, 3);
  assert.equal(result.find((item) => item.id === 'both')?.similarity, 0.82);
});
