import { describe, it, expect } from 'vitest';
import { shuffle, selectRoundParticipants } from './survey-round-selection.js';

describe('shuffle', () => {
  it('preserves all elements and does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect(result.slice().sort()).toEqual(input.slice().sort());
  });

  it('handles an empty array', () => {
    expect(shuffle([])).toEqual([]);
  });
});

describe('selectRoundParticipants', () => {
  it('round 1 selects roughly half the eligible pool, rounded up', () => {
    const eligible = Array.from({ length: 10 }, (_, i) => i);
    const selected = selectRoundParticipants(eligible, 1);
    expect(selected).toHaveLength(5);
  });

  it('round 1 rounds up for odd pool sizes', () => {
    const eligible = Array.from({ length: 7 }, (_, i) => i);
    expect(selectRoundParticipants(eligible, 1)).toHaveLength(4);
  });

  it('round 2 selects the entire eligible pool', () => {
    const eligible = Array.from({ length: 7 }, (_, i) => i);
    expect(selectRoundParticipants(eligible, 2)).toHaveLength(7);
  });

  it('never selects a member not in the eligible pool', () => {
    const eligible = ['a', 'b', 'c', 'd'];
    const selected = selectRoundParticipants(eligible, 1);
    for (const member of selected) {
      expect(eligible).toContain(member);
    }
  });

  it('handles an empty eligible pool for both rounds', () => {
    expect(selectRoundParticipants([], 1)).toEqual([]);
    expect(selectRoundParticipants([], 2)).toEqual([]);
  });
});
