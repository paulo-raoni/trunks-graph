import { describe, expect, it } from 'vitest';

import { entriesToCopy, STORE_ENTRIES } from './former-settings';

const FOUR = ['theme', 'branch-selections', 'details-options', 'details-layouts'];

/** What a first start under the new name copies from the former folder, and when it copies nothing. */
describe('entriesToCopy', () => {
  it('names the four entries the three stores write, and no others', () => {
    expect(STORE_ENTRIES).toStrictEqual(FOUR);
  });

  it('copies the four entries when the new folder holds none and the former holds all', () => {
    expect(entriesToCopy({ overridden: false, present: [], former: FOUR })).toStrictEqual(FOUR);
  });

  it('copies only the entries of the four that the former folder holds', () => {
    const former = ['details-layouts', 'theme'];
    expect(entriesToCopy({ overridden: false, present: [], former })).toStrictEqual([
      'theme',
      'details-layouts',
    ]);
  });

  it('copies nothing else that the former folder holds', () => {
    const former = ['Cache', 'Local Storage', 'theme', 'Preferences', 'details-options'];
    expect(entriesToCopy({ overridden: false, present: [], former })).toStrictEqual([
      'theme',
      'details-options',
    ]);
  });

  it('ignores names in the new folder that are not store entries', () => {
    const present = ['Cache', 'Local Storage'];
    expect(entriesToCopy({ overridden: false, present, former: FOUR })).toStrictEqual(FOUR);
  });

  it.each(FOUR)('copies nothing when the new folder already holds %s', (entry) => {
    expect(entriesToCopy({ overridden: false, present: [entry], former: FOUR })).toStrictEqual([]);
  });

  it('copies nothing when the folder was given on the command line', () => {
    expect(entriesToCopy({ overridden: true, present: [], former: FOUR })).toStrictEqual([]);
  });

  it('copies nothing when there is no former folder', () => {
    expect(entriesToCopy({ overridden: false, present: [], former: [] })).toStrictEqual([]);
  });
});
