import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { BRIDGE_GLOBAL_NAME, CHANNELS } from '../../src/contracts/index';
import { ownFixture, removeOwnFixtures, withOwnProfile } from './support/fixtures';

/**
 * Three tests, and no more, because these three are the ones nothing else does.
 *
 * Wave one's reviews found four ways this application can be broken or unsafe
 * while **every static gate passes**, each demonstrated by probe:
 *
 * 1. the window configured with `contextIsolation: false`, `sandbox: false`,
 *    `nodeIntegration: true` — compiles, builds, opens, looks identical;
 * 2. the preload bundled as an ES module, which Electron's sandboxed loader
 *    refuses by name, leaving a blank window;
 * 3. the bridge exposed under a name the contract does not define, also a blank
 *    window;
 * 4. a re-export deleted from the contract index, which the type projects caught
 *    and the boundary gate did not.
 *
 * The empty-state test and the console test catch the blank-window pair; the
 * sandbox test catches the first, and is the only thing in this repository
 * standing between the project and that configuration. That is the whole reason
 * this gate exists, and it is why a skipped or leaked run is never acceptable as
 * "the other gates were green".
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test.beforeAll(() => {
  const entry = join(repositoryRoot, 'dist', 'main.cjs');
  if (!existsSync(entry)) {
    throw new Error(`${entry} does not exist: run \`npm run build\` before the end-to-end gate`);
  }
});

/**
 * Launch the built application with no folder, on a user-data directory of its
 * own, and run `body` against its first window.
 *
 * Every process this suite starts is stopped by this suite: `withOwnProfile`
 * (`./support/fixtures.ts`) closes the application once `body` is done, whatever
 * it did, and reads the exit status back, because a leaked process is a failure
 * of the gate whatever the assertions said.
 */
async function withWindow(body: (page: Page) => Promise<void>): Promise<void> {
  await withOwnProfile({}, async (application) => body(await application.firstWindow()));
}

test('the window opens and shows the empty state', async () => {
  await withWindow(async (page) => {
    await expect(page.locator('.empty-state__title')).toHaveText('Git Graphical Standalone');
    await expect(page.locator('.empty-state__message')).toHaveText('No repository is open.');
  });
});

test('the sandbox is real and the bridge is the contract', async () => {
  await withWindow(async (page) => {
    await expect(page.locator('.empty-state__message')).toBeVisible();
    const observed = await page.evaluate((bridgeName: string) => {
      const scope = globalThis as unknown as Record<string, unknown>;
      const bridge = scope[bridgeName];
      return {
        require: typeof scope['require'],
        process: typeof scope['process'],
        module: typeof scope['module'],
        methods: typeof bridge === 'object' && bridge !== null ? Object.keys(bridge).sort() : null,
      };
    }, BRIDGE_GLOBAL_NAME);

    expect(observed.require).toBe('undefined');
    expect(observed.process).toBe('undefined');
    expect(observed.module).toBe('undefined');
    expect(observed.methods).toEqual(Object.keys(CHANNELS).sort());
  });
});

test('nothing is logged as an error while the renderer starts', async () => {
  await withWindow(async (page) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (failure) => {
      errors.push(failure.message);
    });
    // A reload is a renderer start, and it is the only one this test can be
    // listening to from the beginning: the first window has already loaded by the
    // time a listener can be attached to it.
    await page.reload();
    await expect(page.locator('.empty-state__message')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.afterAll(() => {
  removeOwnFixtures();
});

/** What {@link readBar} reaches. */
interface BarScope {
  innerWidth: number;
  document: {
    documentElement: { scrollWidth: number; clientWidth: number };
    querySelector: (at: string) => {
      getBoundingClientRect: () => { left: number; right: number; top: number; height: number };
      contains: (other: unknown) => boolean;
    } | null;
    elementFromPoint: (x: number, y: number) => unknown;
  };
}

/** Runs in the page: the width, whether it scrolls sideways, and for each control its edges and whether it is what a press at its middle reaches. */
function readBar(controls: string[]): {
  width: number;
  scrollWidth: number;
  controls: { left: number; right: number; reached: boolean }[];
} {
  const scope = globalThis as unknown as BarScope;
  return {
    width: scope.document.documentElement.clientWidth,
    scrollWidth: scope.document.documentElement.scrollWidth,
    controls: controls.map((selector) => {
      const node = scope.document.querySelector(selector);
      const at = node?.getBoundingClientRect() ?? { left: -1, right: -1, top: 0, height: 0 };
      const hit = scope.document.elementFromPoint((at.left + at.right) / 2, at.top + at.height / 2);
      return { left: at.left, right: at.right, reached: node?.contains(hit) ?? false };
    }),
  };
}

test('at the window minimum size every control of the bar is whole inside the window', async () => {
  // A branch name as long as the Branches box's width limit allows, which is what
  // widens the bar: the fixture's own branch names are short.
  const repository = ownFixture('details', 'script', 6);
  execFileSync('git', ['-C', repository, 'branch', `feature/${'a-long-branch-name-'.repeat(4)}`]);
  const controls = [
    '.bar__open',
    '.bar__refresh',
    '.branches__box',
    '.bar__theme-label',
    '.bar__theme',
  ];
  await withOwnProfile({ open: repository }, async (application) => {
    const page = await application.firstWindow();
    await expect(page.locator('.row').first()).toBeVisible({ timeout: 60_000 });
    // Asking for a size far under the minimum is answered with the minimum itself.
    const size = await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(100, 100);
      return window?.getMinimumSize() ?? [0, 0];
    });
    await expect
      .poll(async () => (await page.evaluate(readBar, controls)).width)
      .toBeLessThanOrEqual(size[0] ?? 0);
    const bar = await page.evaluate(readBar, controls);
    // Not scrolled sideways, and no control outside the width or covered by another.
    expect(bar.scrollWidth).toBe(bar.width);
    bar.controls.forEach((control, at) => {
      expect(control.left, controls[at]).toBeGreaterThanOrEqual(0);
      expect(control.right, controls[at]).toBeLessThanOrEqual(bar.width);
      expect(control.reached, controls[at]).toBe(true);
    });
  });
});
