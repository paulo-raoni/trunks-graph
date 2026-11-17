import { describe, expect, it } from 'vitest';

import { referenceReading } from '../e2e/support/reference-bound';

/**
 * The reference bound's reading (`test/e2e/support/reference-bound.ts`), held:
 * the figure a scroll reading is discarded on is the figure its line prints.
 * It reads no clock and starts no process.
 */

/** `count` timings, the last `above` of them at `value`, the rest at one tenth of a millisecond. */
const timings = (count: number, above: number, value: number): number[] =>
  Array.from({ length: count }, (_unused, at) => (at >= count - above ? value : 0.1));

describe('the reference bound reads the figure it prints', () => {
  it('keeps a percentile that is the bound itself, however the clock grid wrote it', () => {
    // One unit in the last place over 4: what a sum of grid steps can come to.
    const onTheBound = 4 + 4 * Number.EPSILON;
    expect(onTheBound).toBeGreaterThan(4);
    const reading = referenceReading(timings(2400, 200, onTheBound), 0.95, 4);
    expect(reading.discarded).toBe(false);
    expect(reading.account).toContain('percentile of 4.0 ms');
  });

  it('discards a percentile one grid step over the bound, and says so in the figure', () => {
    const reading = referenceReading(timings(2400, 200, 4.1), 0.95, 4);
    expect(reading.discarded).toBe(true);
    expect(reading.account).toContain('percentile of 4.1 ms');
  });

  it('compares what it prints, over every figure of the grid around the bound', () => {
    for (let tenths = 30; tenths <= 50; tenths += 1) {
      const reading = referenceReading(timings(2400, 200, tenths / 10), 0.95, 4);
      const printed = Number(/percentile of ([\d.]+) ms/.exec(reading.account)?.[1]);
      expect(reading.discarded, String(tenths)).toBe(!(printed <= 4));
    }
  });

  it('takes the percentile by position: the share of the timings at or under it', () => {
    const slow = [...timings(2400, 100, 9), ...timings(0, 0, 0)];
    expect(referenceReading(slow, 0.95, 4).discarded).toBe(false);
    expect(referenceReading(timings(2400, 130, 9), 0.95, 4).discarded).toBe(true);
  });

  it('discards a reading with no timings', () => {
    expect(referenceReading([], 0.95, 4).discarded).toBe(true);
  });
});
