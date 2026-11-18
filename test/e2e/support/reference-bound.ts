/**
 * The reference bound of `budgets-frames.spec.ts` (E04-M01-S05), as a pure
 * function so that a unit check can hold it: a scroll reading is discarded when
 * a high percentile of its reference timings is over a bound.
 *
 * **The figure compared is the figure printed.** The timings are on the grid
 * the page's clock reads in, so a percentile can land on the bound itself, and a
 * percentile written as `4.000000000000001` was compared over a bound of 4 while
 * the line printed `4.0` (E04-M01's review round 08, C-31). The percentile is
 * therefore taken to the grid first, `GRID_MILLISECONDS`, and that value is both
 * compared and printed, so that a reading is never discarded for a figure the
 * line shows as at the bound.
 */

/**
 * The step the percentile is taken to, in milliseconds, and printed to: the grid
 * the page's clock reads in. Measured on 2026-11-17 in this application's renderer
 * (`crossOriginIsolated` false): over two million reads of `performance.now()`, the
 * smallest nonzero step between two readings was 0.1 ms.
 */
export const GRID_MILLISECONDS = 0.1;

/** What a reading came to: the figure, whether it is discarded, and the sentence saying so. */
export interface ReferenceReading {
  readonly figure: number;
  readonly discarded: boolean;
  readonly account: string;
}

/**
 * The `share` percentile of `timings`, taken to {@link GRID_MILLISECONDS}, held
 * against `bound` milliseconds. A figure that is not a number is discarded.
 */
export function referenceReading(
  timings: readonly number[],
  share: number,
  bound: number,
): ReferenceReading {
  const sorted = [...timings].sort((left, right) => left - right);
  const raw = sorted[Math.floor(share * sorted.length)] ?? Number.NaN;
  const figure = Math.round(raw / GRID_MILLISECONDS) * GRID_MILLISECONDS;
  const shown = figure.toFixed(1);
  const account =
    `the reference's ${String(sorted.length)} timings have a 95th percentile of ` +
    `${shown} ms, against a bound of ${String(bound)} ms`;
  return { figure: Number(shown), discarded: !(Number(shown) <= bound), account };
}
