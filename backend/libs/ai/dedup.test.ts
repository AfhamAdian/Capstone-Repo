import { describe, it, expect } from 'vitest';
import { dedupeQuestions } from './dedup.js';
import type { GeneratedSurveyQuestion } from './types.js';

function q(text: string, category = 'delivery'): GeneratedSurveyQuestion {
  return { category: category as GeneratedSurveyQuestion['category'], questionText: text, questionType: 'scale' };
}

describe('dedupeQuestions', () => {
  it('keeps distinct questions untouched', () => {
    const input = [q('How confident are you in this sprint?'), q('Are you blocked waiting on anyone this week?', 'blockers')];
    expect(dedupeQuestions(input)).toHaveLength(2);
  });

  it('drops an exact duplicate', () => {
    const input = [q('How confident are you in hitting this sprint commitments?'), q('How confident are you in hitting this sprint commitments?')];
    expect(dedupeQuestions(input)).toHaveLength(1);
  });

  it('drops a near-duplicate reworded question', () => {
    const input = [
      q('How confident are you in hitting this sprint commitments'),
      q('How confident do you feel about hitting the sprint commitments'),
    ];
    expect(dedupeQuestions(input)).toHaveLength(1);
  });

  it('keeps the first occurrence when dropping a duplicate', () => {
    const first = q('How confident are you in hitting this sprint commitments');
    const dupe = q('How confident are you in hitting this sprint commitments');
    const [kept] = dedupeQuestions([first, dupe]);
    expect(kept).toBe(first);
  });

  it('returns an empty array for empty input', () => {
    expect(dedupeQuestions([])).toEqual([]);
  });
});
