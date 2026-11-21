import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, Platform } from 'electron-builder';

import { buildInto } from './build.js';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * The folder `npm run dist` writes the installer and the portable executable
 * to. Git ignores it. `gates:packaging` never writes here: it passes a temporary
 * folder of its own to {@link distributeInto}.
 */
const commandLineOutputRoot = join(repositoryRoot, 'release');

/**
 * Build the application and package it for Windows into `outputRoot`, and
 * return the paths electron-builder says it wrote.
 *
 * **`dist/` is rebuilt first, in production mode**, because the packager takes
 * the application from it (`build.files` in `package.json`: `dist/` and
 * `package.json`, nothing else) and a person who downloads the result runs the
 * minified bundles the size gate weighs, never the development build `npm run
 * build` writes. `buildInto` empties the folder before it writes, so nothing an
 * earlier build left is packaged. That also means `dist/` holds the production
 * build afterwards, until the next `npm run build`.
 *
 * Every other choice is the `build` key of `package.json`, which electron-builder
 * reads and leaves out of the `package.json` it packages: the targets (a per-user
 * NSIS installer and a portable executable, x64), the icon, the include file of
 * the context-menu entry, and no publishing. Only the output folder is given
 * here, so the gate and this command package the same way.
 */
export async function distributeInto(outputRoot) {
  await buildInto(join(repositoryRoot, 'dist'), true);
  return build({
    projectDir: repositoryRoot,
    targets: Platform.WINDOWS.createTarget(),
    config: { directories: { output: outputRoot } },
    publish: 'never',
  });
}

/**
 * Run only when this file is the program, so that importing `distributeInto`
 * from the packaging gate does not also package into `release/`.
 */
const isProgram =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isProgram) {
  try {
    await distributeInto(commandLineOutputRoot);
  } catch (error) {
    process.stderr.write(`dist: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
