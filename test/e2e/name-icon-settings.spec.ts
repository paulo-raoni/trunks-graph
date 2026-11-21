import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';

import { ended, removeProfile } from './support/profile';

/**
 * What the application calls itself, the icon it shows, and the settings it
 * brings across from the folder it kept them in under its former name.
 *
 * **No case here reads or writes the real user-data folders.** Each case builds
 * a parent folder of its own under the system temporary folder. The first case
 * sets `TRUNKS_GRAPH_APP_DATA` to it, which is where the application then looks
 * for its user-data folder (`src/app/main.ts`): the new folder is `Trunks Graph`
 * beside a former `git-graphical-standalone` that the case filled. The second
 * gives the folder on the command line, as every other suite does, with a former
 * folder beside it that holds a theme. The real `%APPDATA%` is named nowhere.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FORMER = 'git-graphical-standalone';

const parents: string[] = [];
const children: ReturnType<ElectronApplication['process']>[] = [];

test.afterEach(async () => {
  for (const child of children.splice(0)) await ended(child);
  for (const parent of parents.splice(0)) await removeProfile(parent);
});

/** A parent folder with a former user-data folder in it, holding settings and things that are not. */
function parentWithFormer(): { parent: string; former: string } {
  const parent = mkdtempSync(join(tmpdir(), 'trunks-graph-rename-'));
  parents.push(parent);
  const former = join(parent, FORMER);
  mkdirSync(join(former, 'branch-selections'), { recursive: true });
  mkdirSync(join(former, 'details-layouts'), { recursive: true });
  mkdirSync(join(former, 'Local Storage'), { recursive: true });
  writeFileSync(join(former, 'theme'), 'dark');
  writeFileSync(join(former, 'details-options'), '{"kept":true}');
  writeFileSync(join(former, 'branch-selections', 'a'), 'selection');
  writeFileSync(join(former, 'details-layouts', 'b'), 'layout');
  writeFileSync(join(former, 'Local Storage', 'stray.txt'), 'not a setting');
  writeFileSync(join(former, 'not-a-setting.txt'), 'not a setting');
  return { parent, former };
}

async function launched(args: string[], env: Record<string, string>): Promise<ElectronApplication> {
  const application = await electron.launch({
    args: ['.', ...args],
    cwd: repositoryRoot,
    env: { ...(process.env as Record<string, string>), ...env },
  });
  children.push(application.process());
  return application;
}

test('the application is named Trunks Graph and is at 0.4.0', async () => {
  const { parent } = parentWithFormer();
  const application = await launched([], { TRUNKS_GRAPH_APP_DATA: parent });
  const read = await application.evaluate(({ app }) => ({
    name: app.getName(),
    version: app.getVersion(),
    userData: app.getPath('userData'),
  }));
  expect(read).toEqual({
    name: 'Trunks Graph',
    version: '0.4.0',
    userData: join(parent, 'Trunks Graph'),
  });
  await expect.poll(async () => (await application.firstWindow()).title()).toBe('Trunks Graph');
  await application.close();
});

test('the icon is the tree logo, a PNG of at least 256 pixels, shipped beside the bundles', () => {
  for (const file of [
    join(repositoryRoot, 'resources', 'icon.png'),
    join(repositoryRoot, 'dist', 'icon.png'),
  ]) {
    expect(existsSync(file)).toBe(true);
    const png = readFileSync(file);
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(256);
    expect(png.readUInt32BE(20)).toBe(png.readUInt32BE(16));
  }
  expect(readFileSync(join(repositoryRoot, 'dist', 'icon.png'))).toEqual(
    readFileSync(join(repositoryRoot, 'resources', 'icon.png')),
  );
});

test('a first start under the new name brings the four store entries across and leaves the rest', async () => {
  const { parent, former } = parentWithFormer();
  const application = await launched([], { TRUNKS_GRAPH_APP_DATA: parent });
  // The theme chosen under the old name is in force on this first start.
  await expect
    .poll(() => application.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
    .toBe('dark');
  await application.close();
  const home = join(parent, 'Trunks Graph');
  expect(readFileSync(join(home, 'theme'), 'utf8')).toBe('dark');
  expect(readFileSync(join(home, 'details-options'), 'utf8')).toBe('{"kept":true}');
  expect(readFileSync(join(home, 'branch-selections', 'a'), 'utf8')).toBe('selection');
  expect(readFileSync(join(home, 'details-layouts', 'b'), 'utf8')).toBe('layout');
  expect(existsSync(join(home, 'not-a-setting.txt'))).toBe(false);
  expect(existsSync(join(home, 'Local Storage', 'stray.txt'))).toBe(false);
  // The former folder is untouched.
  expect(readdirSync(former).sort()).toEqual([
    'Local Storage',
    'branch-selections',
    'details-layouts',
    'details-options',
    'not-a-setting.txt',
    'theme',
  ]);
  expect(readFileSync(join(former, 'theme'), 'utf8')).toBe('dark');
});

test('a folder that already holds a store entry is not copied into', async () => {
  const { parent } = parentWithFormer();
  const home = join(parent, 'Trunks Graph');
  mkdirSync(home);
  writeFileSync(join(home, 'details-options'), '{"own":true}');
  const application = await launched([], { TRUNKS_GRAPH_APP_DATA: parent });
  await expect
    .poll(() => application.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
    .toBe('system');
  await application.close();
  expect(readFileSync(join(home, 'details-options'), 'utf8')).toBe('{"own":true}');
  expect(existsSync(join(home, 'theme'))).toBe(false);
  expect(existsSync(join(home, 'branch-selections'))).toBe(false);
});

test('a user-data folder given on the command line is never copied into', async () => {
  const { parent } = parentWithFormer();
  const home = join(parent, 'profile');
  const application = await launched([`--user-data-dir=${home}`], {});
  await expect
    .poll(() => application.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
    .toBe('system');
  await application.close();
  for (const entry of ['theme', 'branch-selections', 'details-options', 'details-layouts']) {
    expect(existsSync(join(home, entry))).toBe(false);
  }
});
