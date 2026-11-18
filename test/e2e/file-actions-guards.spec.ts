import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { CHANNELS } from '../../src/contracts/index';

import { ownFixture, removeOwnFixtures, withOwnProfile } from './support/fixtures';

/**
 * Two guarantees of the file actions (E04-M01-S10) that `file-actions.spec.ts` did not hold,
 * found by E04-M01's reviews and taken by E07-M01-S02: a file that leads out of the working
 * tree through a junction is refused, and the message of a refused action is shown only
 * while the pane it was asked on is the pane shown.
 *
 * As there, **no case writes the system clipboard or opens a window of another program**:
 * the two calls are replaced in the built application's main process, and what they were
 * handed is read back.
 */

const TWO_PEOPLE = 'rename, delete, add and modify, by two people';

interface Handed {
  copied: string[];
  shown: string[];
}

/** Replace the two calls in the main process; every call is recorded, none reaches the machine. */
async function intercept(application: ElectronApplication): Promise<void> {
  await application.evaluate(({ clipboard, shell }) => {
    const scope = globalThis as unknown as { handed: Handed };
    scope.handed = { copied: [], shown: [] };
    clipboard.writeText = (text: string): Promise<void> => {
      scope.handed.copied.push(text);
      return Promise.resolve();
    };
    shell.showItemInFolder = (path: string): void => {
      scope.handed.shown.push(path);
    };
  });
}

async function withWindow(
  repository: string,
  body: (page: Page, application: ElectronApplication) => Promise<void>,
): Promise<void> {
  await withOwnProfile({ open: repository }, async (app) => {
    const page = await app.firstWindow();
    await expect(page.locator('.row:not([hidden])').first()).toBeVisible({ timeout: 60_000 });
    await intercept(app);
    await body(page, app);
  });
}

async function show(page: Page, text: string): Promise<void> {
  await page.locator('.row', { hasText: text }).locator('.row__subject').click();
  await expect(page.locator('.details__info')).not.toHaveText('Loading…');
  await expect(page.locator('.files__row:not([hidden])').first()).toBeVisible();
}

/** The bridge call a page can make, with whatever it is given. */
function ask(page: Page, request: unknown): Promise<{ ok: boolean; message?: string }> {
  return page.evaluate(
    (given) =>
      (
        globalThis as unknown as {
          gitGraphical: { fileAction: (r: unknown) => Promise<{ ok: boolean; message?: string }> };
        }
      ).gitGraphical.fileAction(given),
    request,
  );
}

test('a file that leads out of the working tree through a junction is refused by both absolute actions', async () => {
  test.setTimeout(240_000);
  const repository = ownFixture('details', 'script', 6);
  const outside = mkdtempSync(join(tmpdir(), 'git-graphical-outside-'));
  writeFileSync(join(outside, 'secret.txt'), 'outside the repository');
  // `mklink /J` needs no administrator; elsewhere a link to a folder is the same thing.
  if (process.platform === 'win32') {
    execFileSync('cmd', ['/c', 'mklink', '/J', join(repository, 'link'), outside]);
  } else {
    symlinkSync(outside, join(repository, 'link'), 'dir');
  }
  try {
    await withWindow(repository, async (page, application) => {
      const target = { kind: 'uncommitted' };
      for (const action of ['open-file', 'copy-absolute-path']) {
        expect(await ask(page, { action, target, path: 'link/secret.txt' }), action).toEqual({
          ok: false,
          kind: 'git-failed',
          message: "`link/secret.txt` leads out of the repository's working tree.",
        });
        // A file that does not exist below the junction leads out as well.
        expect((await ask(page, { action, target, path: 'link/gone.txt' })).ok, action).toBe(false);
      }
      // A file beside it, inside the tree, is still answered.
      expect((await ask(page, { action: 'open-file', target, path: 'renamed.txt' })).ok).toBe(true);
      const handed = await application.evaluate(
        () => (globalThis as unknown as { handed: Handed }).handed,
      );
      expect([handed.copied, handed.shown.length]).toEqual([[], 1]);
    });
  } finally {
    // The junction first: removing it leaves the folder it points at alone.
    rmSync(join(repository, 'link'), { recursive: false, force: true });
    removeOwnFixtures();
    rmSync(outside, { recursive: true, force: true });
  }
});

/** Hold the answer of the file action in the main process until `release` is called, and count it given. */
async function holdActionAnswers(application: ElectronApplication): Promise<void> {
  await application.evaluate(({ ipcMain }, channel) => {
    const scope = globalThis as unknown as { release: () => void; given: number };
    const gate = new Promise<void>((resolve) => {
      scope.release = resolve;
    });
    scope.given = 0;
    const handlers = (
      ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> }
    )._invokeHandlers;
    const handler = handlers.get(channel);
    handlers.set(channel, async (...args: unknown[]) => {
      const reply = await handler?.(...args);
      await gate;
      scope.given += 1;
      return reply;
    });
  }, CHANNELS.fileAction);
}

/** Runs in the page: resolves after two animation frames, so what a task changed is drawn. */
function twoFrames(): Promise<void> {
  const scope = globalThis as unknown as {
    requestAnimationFrame: (callback: () => void) => number;
  };
  return new Promise((done) => {
    scope.requestAnimationFrame(() => {
      scope.requestAnimationFrame(() => {
        done();
      });
    });
  });
}

test('the message of a refused action is not shown on the pane of the commit chosen after it', async () => {
  test.setTimeout(240_000);
  const repository = ownFixture('details', 'script', 6);
  rmSync(join(repository, 'added.txt'));
  try {
    await withWindow(repository, async (page, application) => {
      await show(page, TWO_PEOPLE);
      await holdActionAnswers(application);
      const row = page.locator('.files__row:not([hidden])').filter({ hasText: 'added.txt' });
      await row.hover();
      await row.locator('.files__act[data-action="open-file"]').click();
      await show(page, 'Uncommitted changes');
      await application.evaluate(() => {
        (globalThis as unknown as { release: () => void }).release();
      });
      await expect
        .poll(() => application.evaluate(() => (globalThis as unknown as { given: number }).given))
        .toBe(1);
      // The answer is on its way to the page: a call made after it is answered after it.
      await ask(page, null);
      await page.evaluate(twoFrames);
      await expect(page.locator('.files__error')).toBeHidden();
    });
  } finally {
    removeOwnFixtures();
  }
});
