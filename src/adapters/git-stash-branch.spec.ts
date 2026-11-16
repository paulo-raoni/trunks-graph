import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HASH_BYTE_LENGTH, RefKind } from '../contracts/index';
import type { BranchSelection } from '../contracts/index';

import { hexAt, refNameAt } from './fixtures.spec-support';
import { createGitRepositoryReader } from './git-repository-reader';

/**
 * A branch made on a stash's own commit (`git branch b stash@{0}`), which review
 * round 07 of E04-M01 found putting the stash's internal commits on the page as
 * ordinary rows (carried finding C-26).
 *
 * A stash is a commit whose second parent is a commit of the index and, for
 * `git stash -u`, whose third is a commit of the untracked files. A branch on the
 * stash reaches both through git's own walk. The page shows the stash as the one
 * row `interleaveStashes` makes of it, so the branch's name is on that row, and
 * neither internal commit is a row.
 *
 * Each repository is built here with fixed dates, one with a stash and one with
 * a stash holding an untracked file, so the case holds no clock.
 */

const reader = createGitRepositoryReader();

interface Scratch {
  readonly path: string;
  /** `git rev-parse` of what the page is to hold and what it is not. */
  readonly stash: string;
  readonly base: string;
  readonly internal: readonly string[];
}

let root = '';
const scratches = new Map<string, Scratch>();

/** Run git in `where` with a fixed identity and a moving fixed clock. */
function git(where: string, second: number, args: readonly string[]): string {
  const date = `${String(1_700_000_000 + second)} +0000`;
  return execFileSync('git', ['-C', where, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Stasher',
      GIT_AUTHOR_EMAIL: 'stasher@fixture.invalid',
      GIT_COMMITTER_NAME: 'Stasher',
      GIT_COMMITTER_EMAIL: 'stasher@fixture.invalid',
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    },
  }).trim();
}

/** A repository with two commits, a stash made on the second, and a branch `kept` on the stash. */
function build(name: string, untracked: boolean): Scratch {
  const path = join(root, name);
  mkdirSync(path);
  git(path, 0, ['init', '--quiet', '--initial-branch=main']);
  writeFileSync(join(path, 'tracked.txt'), 'one\n');
  git(path, 1, ['add', '.']);
  git(path, 2, ['commit', '--quiet', '--message', 'first']);
  writeFileSync(join(path, 'tracked.txt'), 'two\n');
  git(path, 3, ['commit', '--quiet', '--all', '--message', 'second']);
  writeFileSync(join(path, 'tracked.txt'), 'three\n');
  git(path, 4, ['add', 'tracked.txt']);
  if (untracked) {
    writeFileSync(join(path, 'loose.txt'), 'loose\n');
  }
  git(path, 5, [
    'stash',
    'push',
    ...(untracked ? ['--include-untracked'] : []),
    '--message',
    'kept',
  ]);
  git(path, 6, ['branch', 'kept', 'stash@{0}']);
  const parents = git(path, 6, ['rev-list', '--parents', '--max-count=1', 'stash@{0}']).split(' ');
  const [stash = '', base = '', ...internal] = parents;
  return { path, stash, base, internal };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'git-graphical-stash-branch-'));
  scratches.set('plain', build('plain', false));
  scratches.set('untracked', build('untracked', true));
}, 120_000);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const SELECTIONS: readonly (readonly [string, BranchSelection | undefined])[] = [
  ['every branch', undefined],
  ['the branch on the stash', { branches: ['refs/heads/kept'], showRemoteBranches: true }],
];

describe.each([
  ['a stash', 'plain', 1],
  ['a stash holding an untracked file', 'untracked', 2],
])('a branch made on %s', (_what, key, internalCount) => {
  it.each(SELECTIONS)(
    'shows the stash as one row and no commit git made for it, under %s',
    async (_s, selection) => {
      const made = scratches.get(key);
      if (made === undefined) {
        throw new Error('the repository was not built');
      }
      expect(made.internal).toHaveLength(internalCount);
      const outcome = await reader.readPage({
        repositoryPath: made.path,
        pageSize: 100,
        ...(selection === undefined ? {} : { selection }),
      });
      if (!outcome.ok) {
        throw new Error(`${outcome.kind}: ${outcome.message}`);
      }
      const page = outcome.value;
      const rows = Array.from({ length: page.commits.count }, (_unused, row) =>
        hexAt(page.commits.hashes, row, HASH_BYTE_LENGTH),
      );
      for (const commit of made.internal) {
        expect(rows, 'an internal commit of the stash').not.toContain(commit);
      }
      expect(rows.filter((hash) => hash === made.stash)).toHaveLength(1);
      expect(rows.filter((hash) => hash === made.base)).toHaveLength(1);
      expect(rows).toHaveLength(3);
      const named = new Map<string, number>();
      for (let ref = 0; ref < page.refs.count; ref += 1) {
        named.set(
          refNameAt(page.refs.names, page.refs.nameOffsets, ref),
          page.refs.commitIndex[ref] ?? -1,
        );
      }
      expect(named.get('kept')).toBe(rows.indexOf(made.stash));
      expect(page.refs.kind.some((kind) => kind === RefKind.Stash)).toBe(true);
      expect(page.hasMore).toBe(false);
    },
  );
});

describe.each([
  ['a stash', 'plain'],
  ['a stash holding an untracked file', 'untracked'],
])('a page of a branch made on %s, shorter than the history', (_what, key) => {
  it.each(SELECTIONS)('is full and says there is more, under %s', async (_s, selection) => {
    const made = scratches.get(key);
    if (made === undefined) {
      throw new Error('the repository was not built');
    }
    const outcome = await reader.readPage({
      repositoryPath: made.path,
      pageSize: 2,
      ...(selection === undefined ? {} : { selection }),
    });
    if (!outcome.ok) {
      throw new Error(`${outcome.kind}: ${outcome.message}`);
    }
    expect(outcome.value.commits.count).toBe(2);
    expect(outcome.value.hasMore).toBe(true);
  });
});
