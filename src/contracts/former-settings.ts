/**
 * What a first start under the application's current name carries over from the
 * folder it kept its settings in under the name it had before (`Git Graphical
 * Standalone`, renamed Trunks Graph on 2026-11-16).
 *
 * Electron names the user-data folder after the application, so the rename moved
 * it, and the settings a person chose under the old name would have been left
 * behind. Here, in the ring the mutation gate covers, because what is copied and
 * when is a decision; reading and writing the folders is `src/app/settings-copy.ts`
 * (`docs/ADR-0002-architecture-and-performance.md` decision 1).
 */

/**
 * The four entries the three stores of `src/app/` write into the user-data
 * folder, and the only things a copy carries: the theme file, the branch
 * selections' folder, the details options' file and the details layouts' folder.
 * Everything else in a user-data folder is Chromium's own caches and local
 * storage, which are not settings.
 */
export const STORE_ENTRIES: readonly string[] = Object.freeze([
  'theme',
  'branch-selections',
  'details-options',
  'details-layouts',
]);

/** What the copy is decided from. */
export interface FormerSettingsFacts {
  /** Whether the user-data folder was given on the command line (`--user-data-dir`). */
  readonly overridden: boolean;
  /** The names found in the user-data folder now. */
  readonly present: readonly string[];
  /** The names found in the former folder, `[]` when there is none. */
  readonly former: readonly string[];
}

/**
 * The entries to copy from the former folder into the new one, in the order of
 * {@link STORE_ENTRIES}, or none.
 *
 * Nothing is copied when the folder was given on the command line, which is how
 * the end-to-end suites launch the application and where a copy would bring a
 * developer's own settings into a test; nor when the folder already holds any of
 * the four entries, which is a start that is not the first under this name and
 * whose choices are never overwritten. Otherwise exactly the entries of the four
 * that the former folder holds.
 */
export function entriesToCopy(facts: FormerSettingsFacts): readonly string[] {
  if (facts.overridden || STORE_ENTRIES.some((entry) => facts.present.includes(entry))) {
    return [];
  }
  return STORE_ENTRIES.filter((entry) => facts.former.includes(entry));
}
