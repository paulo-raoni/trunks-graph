import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ended, removeProfile } from '../e2e/support/profile';
import { removeDirectory } from './shared-store';

/**
 * How an end-to-end case's application is ended and its user-data directory
 * removed (`test/e2e/support/profile.ts`), held with a process tree of this
 * check's own: a parent that does not exit, and a child of it whose working
 * directory is the directory to remove. On Windows a directory a process has as
 * its working directory cannot be removed, which is the hold an application's
 * own child process keeps on a profile after the main process is stopped
 * (E04-M01-S04, review round 01, and C-17 of E04-M01's round 04).
 *
 * It starts two node processes and reads no clock beyond the waits it holds: no
 * Electron, no git.
 */

const spawned: ChildProcess[] = [];
const made: string[] = [];

afterEach(() => {
  for (const child of spawned.splice(0)) child.kill();
  for (const directory of made.splice(0)) removeDirectory(directory);
});

/**
 * A node process that starts a node process of its own with `directory` as that
 * one's working directory, lives for `parentMs`, and says `up` once the child has
 * started and said so. That is after the child holds the directory: a new process
 * does not hold its working directory the instant it is created, which a first
 * version of this check found by removing the directory in that gap. The child
 * lives for `childMs`.
 */
async function tree(directory: string, parentMs: number, childMs: number): Promise<ChildProcess> {
  const child = `process.stdout.write('x'); setTimeout(() => {}, ${String(childMs)})`;
  const parent =
    `const grandchild = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(child)}], ` +
    `{ cwd: process.argv[1], stdio: ['ignore', 'pipe', 'ignore'], detached: true }); ` +
    `grandchild.unref(); grandchild.stdout.once('data', () => { grandchild.stdout.destroy(); process.stdout.write('up'); }); ` +
    `setTimeout(() => {}, ${String(parentMs)});`;
  const process_ = spawn(process.execPath, ['-e', parent, directory], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  spawned.push(process_);
  await new Promise<void>((resolve) =>
    process_.stdout.once('data', () => {
      resolve();
    }),
  );
  return process_;
}

function directory(): string {
  const made_ = mkdtempSync(join(tmpdir(), 'gg-profile-'));
  made.push(made_);
  return made_;
}

describe('ending an application and removing its profile', () => {
  it('stops a main process that did not exit, with the process under it, and then removes the directory', async () => {
    const home = directory();
    const parent = await tree(home, 120_000, 120_000);
    await ended(parent, 500);
    expect(parent.exitCode !== null || parent.signalCode !== null).toBe(true);
    await removeProfile(home, 15_000);
    expect(existsSync(home)).toBe(false);
  });

  it('waits for a process that exits late to let go, longer than a fixed count of tries', async () => {
    const home = directory();
    const parent = await tree(home, 100, 5_000);
    await ended(parent, 5_000);
    await removeProfile(home, 20_000);
    expect(existsSync(home)).toBe(false);
    // `removeDirectory` tries twenty times a hundred milliseconds apart and would throw here,
    // because the process under the parent holds the directory for about five seconds.
  });

  it('gives up with the error when the directory is not free within the time asked', async () => {
    const home = directory();
    const parent = await tree(home, 120_000, 120_000);
    await expect(removeProfile(home, 300)).rejects.toThrow();
    await ended(parent, 500);
    await removeProfile(home, 15_000);
  });
});
