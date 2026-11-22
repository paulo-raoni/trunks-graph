import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { gateModule, root } from './report';

/**
 * What the packaging gate decides, held through its own functions over the
 * committed include file and configuration and over inputs written here. No
 * packager runs, no executable is read and nothing is installed: building the two
 * targets is the gate's own run (`npm run gates:packaging`), and these cases hold
 * what it says of what it reads.
 */

interface Configuration {
  readonly appId?: string;
  readonly nsis?: { readonly include?: string };
}

interface VersionInformation {
  readonly ProductName?: string;
  readonly ProductVersion?: string;
  readonly FileVersion?: string;
}

interface Packaging {
  readonly RELEASE: { readonly productName: string; readonly version: string };
  readonly EXPECTED_REGISTRY: readonly string[];
  readonly registryInstructions: (text: string) => string[];
  readonly includeFindings: (text: string, configuration: Configuration) => string[];
  readonly appIdFindings: (configuration: Configuration, mainSource: string) => string[];
  readonly asarPaths: (header: Buffer) => string[];
  readonly archiveFindings: (paths: readonly string[]) => string[];
  readonly resourcesFindings: (names: readonly string[]) => string[];
  readonly versionFindings: (label: string, information: VersionInformation) => string[];
}

const gate = await gateModule<Packaging>('packaging.js');

/** With its line ends made `\n`, so a case can cut one line out by its text on any checkout. */
const includeText = readFileSync(join(root, 'resources', 'installer.nsh'), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const configuration = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { build: Configuration }
).build;
const mainSource = readFileSync(join(root, 'src', 'app', 'main.ts'), 'utf8');

const FOLDER_VERB = 'Software\\Classes\\Directory\\shell\\TrunksGraph';

describe('the include file writes and removes exactly the context-menu keys', () => {
  it('the committed file and configuration have no finding', () => {
    expect(gate.includeFindings(includeText, configuration)).toEqual([]);
  });

  it('the committed file holds every expected instruction once, in its macro', () => {
    expect(gate.registryInstructions(includeText).sort()).toEqual(
      [...gate.EXPECTED_REGISTRY].sort(),
    );
  });

  it('a key written beyond the two verbs is refused', () => {
    const extra = `${includeText}\n!macro customInstall\n  WriteRegStr HKCU "Software\\Classes\\Drive\\shell\\TrunksGraph" "" "x"\n!macroend\n`;
    expect(gate.includeFindings(extra, configuration)).toEqual([
      'resources/installer.nsh holds `customInstall: WriteRegStr | HKCU | Software\\Classes\\Drive\\shell\\TrunksGraph |  | x`, which is not a key of the context-menu entry',
    ]);
  });

  it('a verb the uninstaller does not remove is refused', () => {
    const kept = includeText.replace(`  DeleteRegKey HKCU "${FOLDER_VERB}"\n`, '');
    expect(gate.includeFindings(kept, configuration)).toEqual([
      `resources/installer.nsh does not hold \`customUnInstall: DeleteRegKey | HKCU | ${FOLDER_VERB}\``,
    ]);
  });

  it('an uninstaller that leaves the installer copy of itself is refused', () => {
    const kept = includeText.replace('    RMDir /r "$LOCALAPPDATA\\trunks-graph-updater"\n', '');
    expect(kept).not.toBe(includeText);
    expect(gate.includeFindings(kept, configuration)).toEqual([
      'resources/installer.nsh does not hold `customUnInstall: RMDir | /r | $LOCALAPPDATA\\trunks-graph-updater`',
    ]);
  });

  it('a removal that an upgrade would also make is refused', () => {
    const always = includeText.replace('  ${ifNot} ${isUpdated}\n', '').replace('  ${endIf}\n', '');
    expect(always).not.toBe(includeText);
    expect(gate.includeFindings(always, configuration)).toEqual([
      'resources/installer.nsh does not hold `customUnInstall: ${ifNot} | ${isUpdated}`',
      'resources/installer.nsh does not hold `customUnInstall: ${endIf}`',
    ]);
  });

  it('a key written for every user rather than the current one is refused both ways', () => {
    const machine = includeText.replace(
      `WriteRegStr HKCU "${FOLDER_VERB}" "" `,
      `WriteRegStr HKLM "${FOLDER_VERB}" "" `,
    );
    expect(gate.includeFindings(machine, configuration)).toEqual([
      `resources/installer.nsh does not hold \`customInstall: WriteRegStr | HKCU | ${FOLDER_VERB} |  | Open in Trunks Graph\``,
      `resources/installer.nsh holds \`customInstall: WriteRegStr | HKLM | ${FOLDER_VERB} |  | Open in Trunks Graph\`, which is not a key of the context-menu entry`,
    ]);
  });

  it('a removal made at install rather than at uninstall is refused', () => {
    const moved = `${includeText}\n!macro customInstall\n  DeleteRegKey HKCU "${FOLDER_VERB}"\n!macroend\n`;
    expect(gate.includeFindings(moved, configuration)).toEqual([
      `resources/installer.nsh holds \`customInstall: DeleteRegKey | HKCU | ${FOLDER_VERB}\`, which is not a key of the context-menu entry`,
    ]);
  });

  it('a commented-out instruction is not read as one', () => {
    expect(
      gate.registryInstructions('; WriteRegStr HKCU "a" "" "b"\n# DeleteRegKey HKCU "a"\n'),
    ).toEqual([]);
  });

  it('a configuration that does not include the file is refused', () => {
    expect(gate.includeFindings(includeText, { ...configuration, nsis: {} })).toEqual([
      'package.json build.nsis.include is not resources/installer.nsh, so the installer would not include it',
    ]);
  });
});

describe("the window's id is the packager's appId", () => {
  it('the committed source and configuration agree', () => {
    expect(gate.appIdFindings(configuration, mainSource)).toEqual([]);
  });

  it('a different id is refused, naming both', () => {
    expect(gate.appIdFindings({ appId: 'other.id' }, mainSource)).toEqual([
      'src/app/main.ts gives the window the id "io.github.paulo-raoni.trunks-graph", and the packager\'s appId is "other.id"',
    ]);
  });

  it('a source that sets no id is refused', () => {
    expect(gate.appIdFindings(configuration, 'app.whenReady();')).toEqual([
      'src/app/main.ts gives the window no APP_USER_MODEL_ID',
    ]);
  });
});

/** An asar header as the packager writes it, around the JSON tree given. */
function asarHeader(tree: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(tree), 'utf8');
  const header = Buffer.alloc(16 + json.length);
  header.writeUInt32LE(4, 0);
  header.writeUInt32LE(8 + json.length, 4);
  header.writeUInt32LE(4 + json.length, 8);
  header.writeUInt32LE(json.length, 12);
  json.copy(header, 16);
  return header;
}

describe('the archive holds package.json and dist/, and nothing else', () => {
  it('the header is read to the files it lists, folders walked', () => {
    const header = asarHeader({
      files: {
        'package.json': { size: 1, offset: '0' },
        dist: {
          files: {
            'main.cjs': { size: 1, offset: '1' },
            ui: { files: { 'a.js': { size: 1, offset: '2' } } },
          },
        },
      },
    });
    expect(gate.asarPaths(header)).toEqual(['dist/main.cjs', 'dist/ui/a.js', 'package.json']);
  });

  it('the paths scope 1 allows have no finding', () => {
    expect(gate.archiveFindings(['dist/index.html', 'dist/main.cjs', 'package.json'])).toEqual([]);
  });

  it('a test file, a source file and a dependency are each refused', () => {
    expect(
      gate.archiveFindings([
        'dist/main.cjs',
        'node_modules/x/index.js',
        'package.json',
        'src/app/main.ts',
        'test/gates/packaging.test.ts',
      ]),
    ).toEqual([
      'the archive holds node_modules/x/index.js, which is neither package.json nor under dist/',
      'the archive holds src/app/main.ts, which is neither package.json nor under dist/',
      'the archive holds test/gates/packaging.test.ts, which is neither package.json nor under dist/',
    ]);
  });

  it('an archive without the entry point or the manifest is refused', () => {
    expect(gate.archiveFindings(['dist/index.html'])).toEqual([
      'the archive does not hold package.json',
      'the archive does not hold dist/main.cjs',
    ]);
  });

  it('anything unpacked beside the archive is refused', () => {
    expect(gate.resourcesFindings(['app.asar', 'app.asar.unpacked'])).toEqual([
      'resources/app.asar.unpacked sits beside the archive, outside what it may hold',
    ]);
  });

  it("the packager's own elevation helper beside the archive is not refused", () => {
    expect(gate.resourcesFindings(['app.asar', 'elevate.exe'])).toEqual([]);
  });
});

describe('each executable names the product and the release', () => {
  const right = { ProductName: 'Trunks Graph', ProductVersion: '0.4.0', FileVersion: '0.4.0.0' };

  it('the release is 0.4.0 of Trunks Graph', () => {
    expect(gate.RELEASE).toEqual({ productName: 'Trunks Graph', version: '0.4.0' });
  });

  it('the right name and version, in three numbers or four, have no finding', () => {
    expect(gate.versionFindings('the installer', right)).toEqual([]);
    expect(gate.versionFindings('the installer', { ...right, FileVersion: '0.4.0' })).toEqual([]);
  });

  it('a wrong version is refused in each field', () => {
    expect(
      gate.versionFindings('the portable', {
        ...right,
        ProductVersion: '0.4.1',
        FileVersion: '0.4.1.0',
      }),
    ).toEqual([
      'the portable has ProductVersion "0.4.1", not 0.4.0',
      'the portable has FileVersion "0.4.1.0", not 0.4.0',
    ]);
  });

  it('a wrong or missing product name is refused', () => {
    expect(
      gate.versionFindings('the installer', { ...right, ProductName: 'trunks-graph' }),
    ).toEqual(['the installer names the product "trunks-graph", not "Trunks Graph"']);
    expect(
      gate.versionFindings('the installer', { ProductVersion: '0.4.0', FileVersion: '0.4.0.0' }),
    ).toEqual(['the installer names the product "undefined", not "Trunks Graph"']);
  });
});
