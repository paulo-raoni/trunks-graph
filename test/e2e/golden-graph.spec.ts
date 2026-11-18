import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { paintedState, withBudgeted } from './support/budgets';
import { readCanvas, setMarking } from './support/budgets-page';
import type { CanvasPixels } from './support/budgets-page';
import { fixture } from './support/fixtures';

/**
 * The graph canvas of a fixture repository, compared byte for byte with a
 * committed golden image (`docs/ADR-0003-quality-gates-and-ci.md` decision 5).
 *
 * Decision 5 admits golden images "once S07 has shown that a render is
 * byte-stable on this machine". E01-M01-S07 showed it on 2026-09-28: the
 * `branch-and-merge` and ten-thousand-commit fixtures, each opened in five
 * separate launches of the built application, gave the same canvas pixels and
 * the same window screenshot, byte for byte, in all five — with the GPU, and
 * again with `--disable-gpu`. The slice document reports that comparison under
 * *The golden-image question*; it records the outcome and no hash of the bytes.
 *
 * **The case renders in software** (`--disable-gpu`), which is a Chromium switch
 * given at launch and changes nothing in the product. A continuous-integration
 * runner has no GPU, so there the canvas is rasterised in software whatever the
 * switch says; drawing it in software here too is what gives the golden image
 * any chance of being the same image there. **Whether it is, no run has shown.**
 * The one inference this rests on, labelled as one: Skia's software rasteriser
 * draws the same pixels from the same commands on two x86-64 processors. It picks
 * its vector code by processor features at run time, so a runner with a
 * different instruction set may round an anti-aliased edge differently, and the
 * first CI run is where that is found out.
 *
 * **The window is set to 960 × 600** before the image is taken, so that the
 * canvas has the same size on a runner whose screen is smaller than the
 * 1280 × 800 the application opens at. The row height and the graph column's
 * width do not depend on the window, so only the canvas's height changes.
 *
 * The golden file is the canvas's unpremultiplied RGBA, row by row, deflated. A
 * mismatch writes what was drawn beside it under `test-results/`, so the two can
 * be compared without re-running.
 */

const here = dirname(fileURLToPath(import.meta.url));
const WIDTH = 960;
const HEIGHT = 600;

/** The canvas once it has been redrawn at the window size this case sets. */
async function canvasAfterResize(page: Page, height: number): Promise<CanvasPixels> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const canvas = await page.evaluate(readCanvas);
    if (canvas.height === height) {
      return canvas;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`the canvas never became ${String(height)} pixels high`);
}

/**
 * Open `repository` in software rendering at the window size above, wait for
 * its `rows` rows to be painted, and require the canvas to be the golden image
 * `name` byte for byte. **A golden image that is not there fails the case**, and
 * the canvas drawn is written beside the others under `test-results/golden/`, which
 * is how a golden image is recorded: look at the graph first, then copy that file
 * into `test/e2e/golden/`.
 */
async function matchesGolden(repository: string, rows: number, name: string): Promise<void> {
  const golden = join(here, 'golden', `${name}.rgba.deflate`);
  await withBudgeted(
    { open: repository, switches: ['--disable-gpu'] },
    async ({ application, page }) => {
      await paintedState(
        page,
        (state) => state.path === repository && state.rows === rows && state.ink > 0,
      );
      await page.evaluate(setMarking, false);
      const before = await page.evaluate(readCanvas);
      const [, chrome] = await application.evaluate(
        ({ BrowserWindow }, size) => {
          const window = BrowserWindow.getAllWindows()[0];
          const outer = window?.getContentSize() ?? [0, 0];
          window?.setContentSize(size.width, size.height);
          return outer;
        },
        { width: WIDTH, height: HEIGHT },
      );
      const expectedHeight = before.height - ((chrome ?? 0) - HEIGHT);
      const canvas = await canvasAfterResize(page, expectedHeight);
      await page.waitForTimeout(300);
      const drawn = Buffer.from((await page.evaluate(readCanvas)).rgba, 'base64');
      const wanted = existsSync(golden) ? inflateSync(readFileSync(golden)) : Buffer.alloc(0);
      const same = drawn.equals(wanted);
      if (!same) {
        const out = resolve(here, '..', '..', 'test-results', 'golden');
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, `${name}.drawn.rgba.deflate`), deflateSync(drawn));
      }
      process.stdout.write(
        `  canvas ${String(canvas.width)} x ${String(canvas.height)}: ${String(drawn.length)} bytes, ` +
          `golden ${String(wanted.length)}, ${same ? 'identical' : 'DIFFERENT'}\n`,
      );
      expect(same).toBe(true);
    },
  );
}

test('the graph canvas of a merge matches its golden image, byte for byte', async () => {
  const repository = fixture('branch-and-merge', 'branch-and-merge', 3);
  await matchesGolden(repository, 6, 'graph-branch-and-merge');
});

/**
 * Row 3 of the `crossing-curve` fixture has a curve from lane 2 to lane 0 across
 * the vertical line of lane 1 (found by the layout pass's own segments, which the
 * fixture's author read, E07-M01-S03). Until then no committed image had a curve
 * crossing another lane's line (E04-M01's review round 06, C-24).
 */
test('the graph canvas of a curve across another lane matches its golden image', async () => {
  const repository = fixture('crossing-curve', 'script', 6);
  await matchesGolden(repository, 6, 'graph-crossing-curve');
});
