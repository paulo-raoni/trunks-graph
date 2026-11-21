import { cpSync, existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { entriesToCopy } from '../contracts/former-settings';

/**
 * The name the application's user-data folder had before the rename to Trunks
 * Graph: Electron names the folder after the npm `name` when `package.json` has
 * no `productName`, and the npm `name` was this. Read from `app.getPath('userData')`
 * on the unchanged build by this lane (`docs/plan/E07-packaging-and-distribution/
 * M01-windows-build/S04-name-icon-version.md`).
 */
const FORMER_FOLDER_NAME = 'git-graphical-standalone';

/** The names in `directory`, or none when it cannot be listed (it does not exist, usually). */
function namesIn(directory: string): string[] {
  try {
    return existsSync(directory) ? readdirSync(directory) : [];
  } catch {
    return [];
  }
}

/**
 * Carry the four store entries of the former user-data folder into `home` on the
 * first start under the new name, before any store is opened. The decision is
 * `entriesToCopy` (`src/contracts/former-settings.ts`); this is the file work.
 *
 * The former folder is the sibling of `home` with the former name, and is left
 * as it is: entries are copied, never moved. **A folder given on the command line
 * is never copied into** — `overridden` is how `main.ts` says so — because the
 * end-to-end suites launch that way on folders of their own. A copy that fails
 * part way is reported on the standard error and the application starts anyway,
 * with whatever was copied.
 *
 * @param home the user-data folder in force
 * @param overridden whether it was given on the command line
 */
export function carryFormerSettings(home: string, overridden: boolean): void {
  const former = join(dirname(home), FORMER_FOLDER_NAME);
  const entries = entriesToCopy({
    overridden,
    present: namesIn(home),
    former: namesIn(former),
  });
  for (const entry of entries) {
    try {
      cpSync(join(former, entry), join(home, entry), {
        recursive: true,
        force: false,
        errorOnExist: false,
      });
    } catch (error) {
      process.stderr.write(
        `Could not carry ${basename(former)}/${entry} over to ${basename(home)}: ${String(error)}\n`,
      );
    }
  }
}
