import { execFileSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { repositoryRoot, report } from './tree.js';

/**
 * The Windows packaging, built and read without installing anything
 * (E07-M01-S05). It is a gate of its own, like the budgets, and is in none of
 * the tiers (`AGENTS.md` §11): the reviewer runs it, `npm run gates:packaging`.
 *
 * It packages both targets exactly as `npm run dist` does, through the same
 * function, into a temporary folder of its own rather than `release/`, and
 * fails unless:
 *
 * - the installer and the portable executable both exist;
 * - each of them, and the application executable they carry, names the product
 *   and the release below in its file version information;
 * - the archive the application runs from holds `package.json` and files under
 *   `dist/`, and no other path, and nothing sits beside it. It is read in
 *   `win-unpacked/`, the folder the packager compresses into both targets: on
 *   2026-11-21 the `app.asar` 7-Zip took out of the installer and out of the
 *   portable executable had the same SHA-256 as that folder's;
 * - the NSIS include file writes and removes exactly the context-menu keys
 *   below, and the configuration includes it;
 * - the packager's `appId` is the id `src/app/main.ts` gives the window.
 *
 * **What it changes, and says so.** The packager takes the application from
 * `dist/`, so packaging writes the production build there. `scripts/build.js`
 * keeps `dist/` as the development build every other gate and `npm start` use,
 * so this gate rebuilds that when it is done, whatever the verdict.
 */

/**
 * The release the files must name. **Not read from `package.json`**: the
 * version in the files is what this gate checks, and an expectation taken from
 * the input that produced it would agree with a wrong version planted there.
 * Moving the version moves this line in the same commit.
 */
export const RELEASE = { productName: 'Trunks Graph', version: '0.4.0' };

/** The include file, as `build.nsis.include` in `package.json` must name it. */
export const INCLUDE_FILE = 'resources/installer.nsh';

/** The two shell verbs of the context-menu entry, under the current user's classes. */
export const VERB_KEYS = [
  'Software\\Classes\\Directory\\shell\\TrunksGraph',
  'Software\\Classes\\Directory\\Background\\shell\\TrunksGraph',
];

/** The folder electron-builder's installer copies itself into, under the user's local application data. */
export const UPDATER_FOLDER = '$LOCALAPPDATA\\trunks-graph-updater';

const INSTALLED_EXECUTABLE = '$INSTDIR\\${APP_EXECUTABLE_FILENAME}';

/**
 * Every registry instruction, folder removal and guard the include file may hold, by the macro it is in,
 * with its arguments unquoted and joined by ` | `. Nothing more and nothing less.
 */
export const EXPECTED_REGISTRY = [
  ...VERB_KEYS.flatMap((key) => [
    `customInstall: WriteRegStr | HKCU | ${key} |  | Open in Trunks Graph`,
    `customInstall: WriteRegStr | HKCU | ${key} | Icon | ${INSTALLED_EXECUTABLE}`,
    `customInstall: WriteRegStr | HKCU | ${key}\\command |  | "${INSTALLED_EXECUTABLE}" "%V"`,
  ]),
  ...VERB_KEYS.map((key) => `customUnInstall: DeleteRegKey | HKCU | ${key}`),
  // The installer's copy of itself, removed at an uninstall and kept at an upgrade.
  'customUnInstall: ${ifNot} | ${isUpdated}',
  `customUnInstall: RMDir | /r | ${UPDATER_FOLDER}`,
  'customUnInstall: ${endIf}',
];

/** An argument of an NSIS instruction: quoted in any of its three quotes, or a bare word. */
const ARGUMENT = /"([^"]*)"|'([^']*)'|`([^`]*)`|(\S+)/g;

/** One line's words, unquoted. */
function wordsOf(line) {
  return [...line.matchAll(ARGUMENT)].map(
    (match) => match.slice(1).find((part) => part !== undefined) ?? '',
  );
}

/** A line NSIS reads as an instruction: neither blank nor a comment. */
function isInstruction(line) {
  return line !== '' && !line.startsWith(';') && !line.startsWith('#');
}

/**
 * Every instruction of `text` that writes or deletes a registry entry or a folder, or guards one, as
 * `<macro>: <instruction> | <argument> | …`. A comment line is skipped.
 */
export function registryInstructions(text) {
  let macro = '(outside every macro)';
  const found = [];
  for (const line of text.split(/\r?\n/).map((each) => each.trim())) {
    if (!isInstruction(line)) continue;
    const words = wordsOf(line);
    const head = (words[0] ?? '').toLowerCase();
    if (head === '!macro') macro = words[1] ?? '';
    else if (head === '!macroend') macro = '(outside every macro)';
    else if (/^(writereg|deletereg|rmdir|\$\{ifnot\}|\$\{endif\})/.test(head)) {
      found.push(`${macro}: ${words.join(' | ')}`);
    }
  }
  return found;
}

/** The include file against {@link EXPECTED_REGISTRY}, both ways, and its place in the configuration. */
export function includeFindings(text, configuration) {
  const found = registryInstructions(text);
  const missing = EXPECTED_REGISTRY.filter((expected) => !found.includes(expected));
  const extra = found.filter((instruction) => !EXPECTED_REGISTRY.includes(instruction));
  const findings = [
    ...missing.map((each) => `${INCLUDE_FILE} does not hold \`${each}\``),
    ...extra.map(
      (each) => `${INCLUDE_FILE} holds \`${each}\`, which is not a key of the context-menu entry`,
    ),
  ];
  if (configuration.nsis?.include !== INCLUDE_FILE) {
    findings.push(
      `package.json build.nsis.include is not ${INCLUDE_FILE}, so the installer would not include it`,
    );
  }
  return findings;
}

/** The id `src/app/main.ts` gives the window, against the packager's `appId`. */
export function appIdFindings(configuration, mainSource) {
  const given = /APP_USER_MODEL_ID = '([^']*)'/.exec(mainSource)?.[1];
  if (given === undefined) return ['src/app/main.ts gives the window no APP_USER_MODEL_ID'];
  return given === configuration.appId
    ? []
    : [
        `src/app/main.ts gives the window the id "${given}", and the packager's appId is "${String(configuration.appId)}"`,
      ];
}

/**
 * The paths of the files an `asar` archive holds, read from its header: a
 * pickled length, then the header's own pickle, whose string is a JSON tree of
 * `files`. The 16 bytes before the JSON are four 32-bit little-endian numbers;
 * the second is the size of the header's pickle and the fourth the JSON's length.
 */
export function asarPaths(header) {
  const length = header.readUInt32LE(12);
  const tree = JSON.parse(header.subarray(16, 16 + length).toString('utf8'));
  const paths = [];
  const walk = (node, prefix) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      if (child.files === undefined) paths.push(`${prefix}${name}`);
      else walk(child, `${prefix}${name}/`);
    }
  };
  walk(tree, '');
  return paths.sort();
}

/** What the archive may hold (task scope 1): `package.json`, and files under `dist/`, and the two it cannot run without. */
export function archiveFindings(paths) {
  const findings = paths
    .filter((path) => path !== 'package.json' && !path.startsWith('dist/'))
    .map((path) => `the archive holds ${path}, which is neither package.json nor under dist/`);
  for (const required of ['package.json', 'dist/main.cjs']) {
    if (!paths.includes(required)) findings.push(`the archive does not hold ${required}`);
  }
  return findings;
}

/**
 * What may sit in the application's `resources/` folder: the archive, and
 * nothing of this repository unpacked or copied beside it.
 *
 * `elevate.exe` is the packager's own helper, not a file of this repository.
 * electron-builder 26.18.0 puts it into the portable target's payload and then
 * into `win-unpacked/`, and its portable options have no switch for it (they
 * have no `packElevateHelper`, read in its `scheme.json`). The installer's
 * payload does not hold it, because `build.nsis.packElevateHelper` is `false`:
 * listed with 7-Zip on 2026-11-21, the installer held 72 files and the
 * portable 73, the one more being `resources\elevate.exe`.
 */
export function resourcesFindings(names) {
  return names
    .filter((name) => name !== 'app.asar' && name !== 'elevate.exe')
    .map((name) => `resources/${name} sits beside the archive, outside what it may hold`);
}

/**
 * One executable's file version information against {@link RELEASE}: the
 * product name, and the product and file versions, which Windows may carry as
 * three numbers or as four with a zero last.
 */
export function versionFindings(label, information) {
  const findings = [];
  if (information.ProductName !== RELEASE.productName) {
    findings.push(
      `${label} names the product "${String(information.ProductName)}", not "${RELEASE.productName}"`,
    );
  }
  for (const field of ['ProductVersion', 'FileVersion']) {
    const value = String(information[field]);
    if (value !== RELEASE.version && value !== `${RELEASE.version}.0`) {
      findings.push(`${label} has ${field} "${value}", not ${RELEASE.version}`);
    }
  }
  return findings;
}

/** Windows' own reading of a file's version information. The path goes by the environment, not quoted into the script. */
function versionInformation(path) {
  const script =
    '[System.Diagnostics.FileVersionInfo]::GetVersionInfo($env:PACKAGING_GATE_FILE) | ' +
    'Select-Object ProductName, ProductVersion, FileVersion | ConvertTo-Json -Compress';
  const output = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      env: { ...process.env, PACKAGING_GATE_FILE: path },
      encoding: 'utf8',
    },
  );
  return JSON.parse(output);
}

/** The first `size` bytes of the archive's header, read without the rest of the archive. */
function asarHeader(path) {
  const descriptor = openSync(path, 'r');
  try {
    const prefix = Buffer.alloc(16);
    readSync(descriptor, prefix, 0, 16, 0);
    const header = Buffer.alloc(16 + prefix.readUInt32LE(12));
    readSync(descriptor, header, 0, header.length, 0);
    return header;
  } finally {
    closeSync(descriptor);
  }
}

/** The two artefacts in the output folder, by the names the configuration gives them. */
function artefacts(output) {
  const executables = readdirSync(output).filter((name) => name.endsWith('.exe'));
  return {
    installer: executables.filter((name) => name.includes(' Setup ')),
    portable: executables.filter((name) => name.endsWith(' Portable.exe')),
  };
}

/** Everything the gate reads in a packaged output folder. */
function outputFindings(output) {
  const findings = [];
  const unpacked = join(output, 'win-unpacked');
  const executables = [
    [`the application executable`, join(unpacked, `${RELEASE.productName}.exe`)],
  ];
  for (const [kind, names] of Object.entries(artefacts(output))) {
    if (names.length !== 1)
      findings.push(`expected one ${kind} executable in the output, found ${String(names.length)}`);
    else executables.push([`the ${kind}, ${names[0]}`, join(output, names[0])]);
  }
  for (const [label, path] of executables) {
    if (existsSync(path)) findings.push(...versionFindings(label, versionInformation(path)));
    else findings.push(`${label} does not exist`);
  }
  const archive = join(unpacked, 'resources', 'app.asar');
  if (existsSync(archive)) findings.push(...archiveFindings(asarPaths(asarHeader(archive))));
  else findings.push('the application has no resources/app.asar');
  findings.push(...resourcesFindings(readdirSync(join(unpacked, 'resources'))));
  return findings;
}

/** The gate: package into a folder of its own, read it, remove it, put `dist/` back. */
async function main() {
  const packageJson = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'));
  const configuration = packageJson.build ?? {};
  const findings = [
    ...includeFindings(readFileSync(join(repositoryRoot, INCLUDE_FILE), 'utf8'), configuration),
    ...appIdFindings(
      configuration,
      readFileSync(join(repositoryRoot, 'src', 'app', 'main.ts'), 'utf8'),
    ),
  ];
  const output = mkdtempSync(join(tmpdir(), 'trunks-graph-packaging-'));
  const { distributeInto, failOnExit } = await import('../dist.js');
  const { buildInto } = await import('../build.js');
  try {
    await distributeInto(output);
    findings.push(...outputFindings(output));
  } catch (error) {
    findings.push(`the packager failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    rmSync(output, { recursive: true, force: true });
    await buildInto(join(repositoryRoot, 'dist'), false);
    process.stdout.write(
      'packaging: dist/ rebuilt in development mode, as npm run build leaves it\n',
    );
  }
  report('packaging', findings);
  // `report` sets the exit code, and the packager's own cleanup would put it back to 0.
  if (findings.length > 0) failOnExit();
}

/** Run as a program, the gate; imported, as `test/gates/` does, nothing runs. */
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
