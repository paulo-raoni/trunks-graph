import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { CHANNELS } from '../../src/contracts/index';
import type { GitGraphicalBridge } from '../../src/contracts/index';
import { FURTHER_PAGE_COMMITS } from '../../src/core/page/index';
import {
  fixture,
  fixtureRoot,
  ownFixture,
  removeOwnFixtures,
  withOwnProfile,
} from './support/fixtures';

/**
 * While a repository opens, the window names it, shows that work goes on, and
 * can cancel it (E07-M01-S06).
 *
 * **A slow open is made, not waited for.** Each case that cancels an open while
 * git reads gives the repository a `core.fsmonitor` hook that sleeps
 * {@link HOOK_SECONDS} seconds, which `git status`, the last of the open's five git
 * commands, runs and waits on: measured in this lane on 2026-11-21 with a hook
 * sleeping 5 s, that status took 6.2 s. So the open is still reading when the case
 * presses Escape, on any machine. A hook git started is not ended with git: when
 * the cancel lands inside that status, the case's late reply came about
 * {@link HOOK_SECONDS} seconds later in this lane's runs, so each case waits for the
 * hook to be gone before it ends, and its repository can be removed.
 *
 * **A late page is made by holding a reply in the main process.** The bridge in
 * the page is frozen, so the case that needs a page to arrive after the cancel
 * replaces the open's handler in the main process with one that waits to hand
 * its reply back, through `ipcMain`'s own table of handlers, which is not a
 * public part of Electron: {@link holdOpens} fails loudly if it is not there.
 *
 * Whether git was ended is read from the operating system's process table: the
 * `git.exe` processes whose command line names the folder. Windows only, as the
 * other cases that read it (`./support/budgets.ts`).
 */

test.describe.configure({ timeout: 240_000 });

/** How long after a cancel the git of the open it cancelled may still be seen. */
const ENDED_WITHIN = 5_000;

/**
 * How long the slow repository's hook sleeps, and so how long its open would read.
 * Far longer than the {@link ENDED_WITHIN} a case gives git to be gone after a
 * cancel: with an 8 s sleep, a cancel that ended nothing was not told from one that
 * ended git, because the sleep ran out inside the wait (a probe of this lane).
 */
const HOOK_SECONDS = 30;

/** How long a case waits for what the slow repository's hook holds to end. */
const HOOK_ENDS = (HOOK_SECONDS + 30) * 1_000;

const NOTICE = '.opening';
const ROW = '.row';
const PATH = '.bar__path';

/** A repository whose open reads for {@link HOOK_SECONDS} seconds in `git status`. */
function slowRepository(): string {
  const repository = ownFixture('slow-open', 'linear', 5);
  const hook = join(dirname(repository), 'sleeping-fsmonitor.sh');
  writeFileSync(hook, `#!/bin/sh\nsleep ${String(HOOK_SECONDS)}\n`);
  execFileSync('git', ['-C', repository, 'config', 'core.fsmonitor', hook.replaceAll('\\', '/')]);
  return repository;
}

/** How many processes of `name` have a command line holding `text`. */
function processesNaming(name: string, text: string): number {
  const query =
    `@(Get-CimInstance Win32_Process -Filter "Name='${name}'" | ` +
    `Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:NAMING) }).Count`;
  const output = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', query],
    {
      encoding: 'utf8',
      env: { ...process.env, NAMING: text },
      windowsHide: true,
    },
  );
  return Number(output.trim());
}

/** Answer the folder dialog with `chosen`, in the main process, where it runs. */
async function answerTheDialog(application: ElectronApplication, chosen: string): Promise<void> {
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
  }, chosen);
}

/** What {@link holdOpens} records in the main process: each open's reply, when made and when handed back. */
interface OpenRecord {
  answered: string[];
  returned: string[];
}

/**
 * Runs in the main process: replace the open's handler with one that records
 * each reply, and, with `hold`, hands it back only once `releaseOpens` is called.
 */
function holdOpens(
  electronModule: { ipcMain: unknown },
  input: { channel: string; hold: boolean },
): void {
  type Handler = (...args: unknown[]) => Promise<{ ok: boolean; kind?: string }>;
  const handlers = (electronModule.ipcMain as { _invokeHandlers?: unknown })._invokeHandlers;
  const original =
    handlers instanceof Map ? (handlers.get(input.channel) as Handler | undefined) : undefined;
  if (!(handlers instanceof Map) || original === undefined) {
    throw new Error(
      'ipcMain no longer keeps its handlers in _invokeHandlers: this case cannot hold a reply',
    );
  }
  const record: OpenRecord = { answered: [], returned: [] };
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  Object.assign(globalThis, { openRecord: record, releaseOpens: release });
  handlers.set(input.channel, async (...args: unknown[]) => {
    const reply = await original(...args);
    const said = reply.ok ? 'ok' : (reply.kind ?? 'failed');
    record.answered.push(said);
    if (input.hold) await released;
    record.returned.push(said);
    return reply;
  });
}

const readRecord = (application: ElectronApplication): Promise<OpenRecord> =>
  application.evaluate(() => (globalThis as unknown as { openRecord: OpenRecord }).openRecord);

/** Runs in the page: one Load More over the bridge, and the page it answered. */
async function loadMoreOnce(count: number): Promise<{ ok: boolean; rows: number }> {
  const bridge = (globalThis as unknown as { gitGraphical: GitGraphicalBridge }).gitGraphical;
  const reply = await bridge.loadMoreCommits({ count });
  return reply.ok ? { ok: true, rows: reply.value.layout.rowCount } : { ok: false, rows: -1 };
}

/* --- What runs inside the page. `tsconfig.node.json` has no DOM library, so
   what these touch is described here rather than borrowed. --- */

interface FrameScope {
  readonly requestAnimationFrame: (callback: () => void) => number;
  readonly document: { readonly querySelector: (selector: string) => object | null };
  readonly getComputedStyle: (at: object) => { readonly animationName: string };
}

/** Runs in the page: wait for two frames, so that anything a reply changed has been painted. */
function twoFrames(): Promise<void> {
  const scope = globalThis as unknown as FrameScope;
  return new Promise((done) => {
    scope.requestAnimationFrame(() => {
      scope.requestAnimationFrame(() => {
        done();
      });
    });
  });
}

/** Runs in the page: the animation the element `selector` finds is running, or `''`. */
function animationOf(selector: string): string {
  const scope = globalThis as unknown as FrameScope;
  const found = scope.document.querySelector(selector);
  return found === null ? '' : scope.getComputedStyle(found).animationName;
}

/** The notice of `path`, as a person and a screen reader meet it, over a held window. */
async function expectNotice(page: Page, path: string, name: string): Promise<void> {
  await expect(page.locator(NOTICE)).toBeVisible();
  await expect(page.locator('.opening__name')).toHaveText(name);
  await expect(page.locator('.opening__path')).toHaveText(path);
  await expect(page.locator('.opening__said')).toHaveText(`Opening ${name}, ${path}`);
  await expect(page.locator('.opening__said')).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(page.locator('.stage')).toHaveJSProperty('inert', true);
  await expect(page.locator('.bar__open')).toBeDisabled();
}

/** The window as it was before the open: `path` shown with its first row, nothing held. */
async function expectShown(page: Page, path: string, firstRow: string): Promise<void> {
  await expect(page.locator(NOTICE)).toBeHidden();
  await expect(page.locator('.opening__said')).toHaveText('');
  await expect(page.locator(PATH)).toHaveText(path);
  await expect(page.locator(ROW).first()).toContainText(firstRow);
  await expect(page.locator('.stage')).toHaveJSProperty('inert', false);
  await expect(page.locator('.bar__open')).toBeEnabled();
  await expect(page.locator('.bar__open')).toHaveText('Open Repository');
}

test.afterEach(removeOwnFixtures);

test('the notice names the folder opening, and Escape ends its git and puts back the one shown', async () => {
  const small = fixture('tags', 'tags', 3);
  const slow = slowRepository();
  await withOwnProfile({ open: small }, async (application) => {
    const page = await application.firstWindow();
    await expectShown(page, small, 'commit 3');
    await application.evaluate(holdOpens, { channel: CHANNELS.openRepository, hold: false });
    await answerTheDialog(application, slow);
    await page.locator('.bar__open').click();
    await expectNotice(page, slow, 'slow-open');
    await expect(page.locator(PATH)).toHaveText(small);
    expect(await page.evaluate(animationOf, '.opening__spinner')).toBe('opening-turn');
    await expect.poll(() => processesNaming('git.exe', slow)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    // At once: the hook holds git for HOOK_SECONDS, so a wait that ran on would still show it.
    await expect(page.locator(NOTICE)).toBeHidden({ timeout: 3_000 });
    await expectShown(page, small, 'commit 3');
    await expect.poll(() => processesNaming('git.exe', slow), { timeout: ENDED_WITHIN }).toBe(0);
    await expect
      .poll(async () => (await readRecord(application)).returned, { timeout: HOOK_ENDS })
      .toEqual(['cancelled']);
    await page.evaluate(twoFrames);
    await expectShown(page, small, 'commit 3');
    expect(await page.evaluate(loadMoreOnce, FURTHER_PAGE_COMMITS)).toEqual({ ok: true, rows: 3 });
    await expect
      .poll(() => processesNaming('sh.exe', 'sleeping-fsmonitor'), { timeout: HOOK_ENDS })
      .toBe(0);
  });
});

test('a page that arrives after Cancel is not drawn, and the repository it replaced is open again', async () => {
  const small = fixture('tags', 'tags', 3);
  const other = fixture('linear', 'linear', 5);
  await withOwnProfile({ open: small }, async (application) => {
    const page = await application.firstWindow();
    await expectShown(page, small, 'commit 3');
    await application.evaluate(holdOpens, { channel: CHANNELS.openRepository, hold: true });
    await answerTheDialog(application, other);
    await page.locator('.bar__open').click();
    await expectNotice(page, other, basename(other));
    // The utility process has read the other repository and put it in place.
    await expect.poll(async () => (await readRecord(application)).answered).toEqual(['ok']);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expectShown(page, small, 'commit 3');
    await application.evaluate(() => {
      (globalThis as unknown as { releaseOpens: () => void }).releaseOpens();
    });
    await expect.poll(async () => (await readRecord(application)).returned).toEqual(['ok']);
    await page.evaluate(twoFrames);
    await expectShown(page, small, 'commit 3');
    expect(await page.evaluate(loadMoreOnce, FURTHER_PAGE_COMMITS)).toEqual({ ok: true, rows: 3 });
  });
});

test('a cancel from the empty window leaves the empty window, and less motion fades the ring', async () => {
  const slow = slowRepository();
  await withOwnProfile({}, async (application) => {
    const page = await application.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.empty-state__message')).toBeVisible();
    await answerTheDialog(application, slow);
    await page.locator('.bar__open').click();
    await expectNotice(page, slow, 'slow-open');
    expect(await page.evaluate(animationOf, '.opening__spinner')).toBe('opening-fade');
    await page.keyboard.press('Escape');
    await expect(page.locator(NOTICE)).toBeHidden({ timeout: 3_000 });
    await expect(page.locator('.empty-state__message')).toBeVisible();
    await expect(page.locator(PATH)).toHaveText('No repository open');
    await expect(page.locator('.bar__refresh')).toBeDisabled();
    await expect(page.locator('.bar__open')).toBeEnabled();
    expect(await page.evaluate(loadMoreOnce, FURTHER_PAGE_COMMITS)).toEqual({
      ok: false,
      rows: -1,
    });
    await expect.poll(() => processesNaming('git.exe', slow), { timeout: ENDED_WITHIN }).toBe(0);
    await expect
      .poll(() => processesNaming('sh.exe', 'sleeping-fsmonitor'), { timeout: HOOK_ENDS })
      .toBe(0);
  });
});

test('an open named on the command line shows no notice, and holds the Open control', async () => {
  const slow = slowRepository();
  await withOwnProfile({ open: slow }, async (application) => {
    const page = await application.firstWindow();
    // Reading, held by the hook: the control waits, and nothing covers the window.
    await expect.poll(() => processesNaming('git.exe', slow)).toBeGreaterThan(0);
    await expect(page.locator('.bar__open')).toBeDisabled();
    await expect(page.locator('.bar__open')).toHaveText('Opening…');
    await expect(page.locator(NOTICE)).toBeHidden();
    await expect(page.locator('.opening__said')).toHaveText('');
    await expect(page.locator('.stage')).toHaveJSProperty('inert', false);
    await expect(page.locator(PATH)).toHaveText('No repository open');
    await expect(page.locator(ROW).first()).toContainText('commit 5', { timeout: HOOK_ENDS });
    await expect(page.locator(PATH)).toHaveText(slow);
    await expect(page.locator('.bar__open')).toBeEnabled();
  });
});

test('a failed open takes the notice away and shows the failure', async () => {
  const small = fixture('tags', 'tags', 3);
  const notARepository = join(fixtureRoot, 'not-a-repository');
  mkdirSync(notARepository, { recursive: true });
  await withOwnProfile({ open: small }, async (application) => {
    const page = await application.firstWindow();
    await expectShown(page, small, 'commit 3');
    await answerTheDialog(application, notARepository);
    await page.locator('.bar__open').click();
    await expect(page.locator('.failure__headline')).toHaveText(
      'That folder is not a git repository.',
    );
    await expect(page.locator(NOTICE)).toBeHidden();
    await expect(page.locator('.failure')).toHaveJSProperty('inert', false);
    await expect(page.locator('.bar__open')).toBeEnabled();
  });
});
