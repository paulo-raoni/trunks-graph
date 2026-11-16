import { beforeAll, describe, expect, it } from 'vitest';

import type { BranchSelection } from '../contracts/index';

import { fixtureAt } from './fixtures.spec-support';
import { commitLogArgs } from './git-commands';
import { discoverGit } from './git-executable';
import { runGit } from './git-process';

/**
 * A run that is given no input ends, and does not wait for some (E07-M01-S01,
 * carried finding C-36).
 *
 * `commitLogArgs(…, true)` under a selection gives the log `--stdin`, which has
 * git read its revisions from standard input until it is closed. The reader
 * never reaches that with no name to write: `selectsAnyRevision` runs no log for
 * a selection that reads none. But a caller that did would have had git wait for
 * ever, because `runGit` closed standard input only when it had text to write.
 * It closes it in every case now.
 *
 * The case builds that selection on the `stash` fixture, a name `commitLogArgs`
 * does not read (it has neither `refs/heads/` nor `refs/remotes/` before it), and
 * runs the log with no input. A run still waiting after {@link LIMIT_SECONDS} is
 * the failure: the longest an ending run took here is far below it.
 */

const LIMIT_SECONDS = 30;

let git = '';

beforeAll(async () => {
  const found = await discoverGit({ platform: process.platform, environment: process.env });
  if (!found.ok) {
    throw new Error(found.message);
  }
  git = found.value.path;
});

describe('a log under a selection that reads no name, given no input', () => {
  it('ends instead of waiting on its standard input', async () => {
    const selection: BranchSelection = { branches: ['main'], showRemoteBranches: true };
    const args = commitLogArgs(fixtureAt('stash'), 10, selection, [], true);
    expect(args).toContain('--stdin');
    let timer: NodeJS.Timeout | undefined;
    const waited = new Promise<'waiting'>((resolve) => {
      timer = setTimeout(() => {
        resolve('waiting');
      }, LIMIT_SECONDS * 1000);
    });
    const ran = runGit({ executable: git, args }).then(() => 'ended' as const);
    const first = await Promise.race([ran, waited]);
    clearTimeout(timer);
    expect(first).toBe('ended');
  }, 60_000);
});
