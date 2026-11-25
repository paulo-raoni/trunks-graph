import type { ChildProcess } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

/**
 * How a launched application's process and its user-data directory are ended
 * and removed. Kept apart from `fixtures.ts`, which reads the fixture store when
 * it loads, so that a unit check can run these two functions on their own.
 */

/** How long {@link ended} waits, by default, for the application to exit before it stops it. */
const EXIT_WAIT_MS = 10_000;

/**
 * Settle once `child` has exited, stopping it, and every process it started,
 * if it has not within {@link EXIT_WAIT_MS}: it is this run's own process,
 * launched by `withOwnProfile` or by a suite that launches for itself, and its
 * profile is about to be removed.
 *
 * The process tree is stopped, not the main process alone, because a case that
 * ran out can leave Electron's own child processes holding a handle in the
 * profile (E04-M01 round 04, finding C-17). A tree that is gone is not enough to
 * remove the directory in the same instant either, which {@link removeProfile}
 * waits for.
 */
export async function ended(child: ChildProcess, within = EXIT_WAIT_MS): Promise<void> {
  const gone = (): boolean => child.exitCode !== null || child.signalCode !== null;
  const exit = (within: number): Promise<void> =>
    new Promise((resolve) => {
      if (gone()) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, within);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  await exit(within);
  if (!gone()) {
    stopTree(child);
    await exit(within);
  }
}

/** Stop `child` and every process descended from it. */
function stopTree(child: ChildProcess): void {
  if (child.pid !== undefined && process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      return;
    } catch {
      // The tree was already gone, or could not be asked: fall through to the process alone.
    }
  }
  child.kill();
}

/** How long {@link removeProfile} waits for the directory to be free. */
const FREE_WAIT_MS = 30_000;
/** The pause between two attempts to remove the directory. */
const RETRY_MS = 100;

/** Errors a directory is removed again on: a handle somebody still holds in it. */
const HELD = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY', 'EACCES']);

/**
 * Remove `directory`, trying again for as long as the error says a process
 * still holds something in it, until `within` milliseconds have passed.
 *
 * The condition is the removal itself succeeding: the wait is for whatever still
 * holds a file in the directory to let go, which a fixed count of retries beside
 * the removal (`removeDirectory` of `test/fixtures/shared-store.ts`: twenty tries
 * a hundred milliseconds apart) does not wait for. An error that is not a held
 * handle is thrown at once, and so is the last one when `within` has passed.
 */
export async function removeProfile(directory: string, within = FREE_WAIT_MS): Promise<void> {
  const until = Date.now() + within;
  for (;;) {
    try {
      rmSync(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === undefined || !HELD.has(code) || Date.now() > until) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }
}

const trackedProcesses: ChildProcess[] = [];
const trackedDirectories: string[] = [];

/** Remember `child` for {@link settleTracked}, and return it. */
export function tracked(child: ChildProcess): ChildProcess {
  trackedProcesses.push(child);
  return child;
}

/** Remember `directory` for {@link settleTracked}, and return it. */
export function trackedDirectory(directory: string): string {
  trackedDirectories.push(directory);
  return directory;
}

/**
 * Wait for every remembered process to end, then remove every remembered
 * directory. For an `afterAll` hook: a case that ran out leaves its application
 * running while that hook runs, and the directory goes only after the process.
 */
export async function settleTracked(): Promise<void> {
  for (const child of trackedProcesses.splice(0)) await ended(child);
  for (const directory of trackedDirectories.splice(0)) await removeProfile(directory);
}
