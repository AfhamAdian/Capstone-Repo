/**
 * Pure selection logic for the two-round 50/50 auto-pulse rollout, split out
 * from survey-distribution-processor.ts so it's unit-testable without a
 * database (the processor only supplies the eligible pool + round; this file
 * has no I/O).
 */

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/**
 * Round 1 takes a random ~50% (rounded up) of the eligible pool; round 2 takes
 * whoever is still eligible (round-1 recipients are excluded upstream by the
 * monthly cap, so round 2 naturally picks up close to the other half).
 */
export function selectRoundParticipants<T>(eligible: T[], round: 1 | 2): T[] {
  if (round === 1) {
    const target = Math.ceil(eligible.length * 0.5);
    return shuffle(eligible).slice(0, target);
  }
  return shuffle(eligible);
}
