import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeActionSearchQuery, type ActionRow } from '../apps/api/database/actions.js';
import { actionScopeForSession, groupEffectivenessReviews, isValidDateOnly } from '../apps/api/controllers/actions.controller.js';

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
    company_id: 1,
    logged_by_user_id: 1,
    next_review_at: `${date}T00:00:00.000Z`,
    effectiveness_rated_by_user_id: null,
    effectiveness_rated_at: null,
    updated_at: `${date}T00:00:00.000Z`,
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

test('member action scope is owner-only while admin scope is company-wide', () => {
  assert.deepEqual(actionScopeForSession({ companyId: 12, userId: 34, role: 'member' }), {
    companyId: 12,
    ownerUserId: 34,
  });
  assert.deepEqual(actionScopeForSession({ companyId: 12, userId: 99, role: 'admin' }), {
    companyId: 12,
  });
});

test('effectiveness queue separates last week, overdue, and deferred actions', () => {
  const lastWeek = row('last-week', '2026-08-24');
  lastWeek.next_review_at = '2026-08-31T00:00:00.000Z';
  const overdue = row('overdue', '2026-07-01');
  overdue.next_review_at = '2026-07-08T00:00:00.000Z';
  const deferred = row('deferred', '2026-08-18');
  deferred.next_review_at = '2026-09-14T00:00:00.000Z';

  const queue = groupEffectivenessReviews([lastWeek, overdue, deferred], new Date('2026-08-31T10:00:00.000Z'));
  assert.deepEqual(queue.from_last_week.map((action) => action.id), ['last-week']);
  assert.deepEqual(queue.earlier.map((action) => action.id), ['overdue']);
  assert.deepEqual(queue.waiting_for_outcome.map((action) => action.id), ['deferred']);
  assert.equal(queue.ready_count, 2);
});
