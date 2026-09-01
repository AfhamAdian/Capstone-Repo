import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './map-with-concurrency.js';

describe('mapWithConcurrency', () => {
  it('preserves result order while limiting active work', async () => {
    let active = 0;
    let maxActive = 0;

    const results = await mapWithConcurrency([40, 10, 30, 20, 5], 4, async (delay, index) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return index * 2;
    });

    expect(results).toEqual([0, 2, 4, 6, 8]);
    expect(maxActive).toBe(4);
  });

  it('rejects an invalid concurrency limit', async () => {
    await expect(mapWithConcurrency([1], 0, async (value) => value)).rejects.toThrow(
      'concurrency must be a positive integer',
    );
  });
});
