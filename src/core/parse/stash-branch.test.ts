import { describe, expect, it } from 'vitest';

import { HASH_BYTE_LENGTH } from '../../contracts/index';
import type { AppendedCommit } from '../store/index';

import { interleaveStashes } from './stash-list';
import type { StashList } from './stash-list';

/** The binary object name whose every byte is `byte`. */
function name(byte: number): Uint8Array {
  return new Uint8Array(HASH_BYTE_LENGTH).fill(byte);
}

/** A commit named by `byte`, committed at `time`, with parents named by `parents`. */
function commit(byte: number, time: number, parents: readonly number[] = []): AppendedCommit {
  const parentHashes = new Uint8Array(parents.length * HASH_BYTE_LENGTH);
  parents.forEach((parent, at) => parentHashes.fill(parent, at * HASH_BYTE_LENGTH));
  return {
    hash: name(byte),
    parentHashes,
    authorName: '',
    authorEmail: '',
    authorTime: time,
    authorTzMinutes: 0,
    committerName: '',
    committerEmail: '',
    commitTime: time,
    commitTzMinutes: 0,
    subject: `commit ${String(byte)}`,
  };
}

/** A list of stashes, each named by its own byte, made on the commit named by `base`. */
function stashes(...entries: readonly (readonly [number, number, number])[]): StashList {
  return {
    entries: entries.map(([own, time, base], at) => ({
      name: `stash@{${String(at)}}`,
      commit: commit(own, time, [base]),
    })),
  };
}

/** The rows `log` becomes with `list` put in, as the first byte of each row's name. */
function rowsOf(list: StashList, byDate: boolean, log: readonly AppendedCommit[]): number[] {
  const rows: number[] = [];
  const sink = interleaveStashes(list, byDate, (row) => rows.push(row.hash[0] ?? -1));
  for (const one of log) {
    sink(one);
  }
  return rows;
}

/** A log of three commits, 0x03 newest, each the parent of the one above it. */
const LOG = [commit(0x03, 30, [0x02]), commit(0x02, 20, [0x01]), commit(0x01, 10)];

describe("interleaveStashes, a branch made on a stash's own commit (E07-M01-S01)", () => {
  const own = commit(0x51, 25, [0x02, 0x12, 0x13]);
  const index = commit(0x12, 25, [0x02]);
  const untracked = commit(0x13, 25);

  it('drops the index commit and the untracked-files commit the log walks after the copy', () => {
    for (const byDate of [true, false]) {
      const log = [LOG[0], own, index, untracked, LOG[1], LOG[2]].filter(
        (one) => one !== undefined,
      );
      expect(rowsOf(stashes([0x51, 25, 0x02]), byDate, log), String(byDate)).toEqual([
        0x03, 0x51, 0x02, 0x01,
      ]);
    }
  });

  it('drops each of them wherever the log puts them after the copy, the second parent alone too', () => {
    const second = commit(0x51, 25, [0x02, 0x12]);
    const log = [LOG[0], second, LOG[1], index, LOG[2]].filter((one) => one !== undefined);
    expect(rowsOf(stashes([0x51, 25, 0x02]), true, log)).toEqual([0x03, 0x51, 0x02, 0x01]);
    const late = [LOG[0], own, LOG[1], untracked, LOG[2]].filter((one) => one !== undefined);
    expect(rowsOf(stashes([0x51, 25, 0x02]), true, late)).toEqual([0x03, 0x51, 0x02, 0x01]);
  });

  it('keeps the first parent, which is the commit the stash was made on', () => {
    const log = [own, LOG[1], LOG[2]].filter((one) => one !== undefined);
    expect(rowsOf(stashes([0x51, 25, 0x02]), true, log)).toContain(0x02);
  });

  it('keeps a commit of the same name when no stash of the list is the log copy', () => {
    const log = [LOG[0], index, LOG[1], LOG[2]].filter((one) => one !== undefined);
    expect(rowsOf(stashes([0x51, 5, 0x01]), true, log)).toEqual([0x03, 0x12, 0x02, 0x51, 0x01]);
  });
});
