# E07-M01-S04 · The name, icon and version

**Parent:** E07 Packaging and distribution > E07-M01 Windows build > E07-M01-S04 the name, icon and version

The application calls itself Trunks Graph, shows the tree logo as its window icon, reports version 0.4.0, and brings
across the settings a person chose under the old name. None of this is behaviour of Git Graph.

## The name and the version

- `package.json` has `"name": "trunks-graph"`, `"productName": "Trunks Graph"` and `"version": "0.4.0"`; the root
  entries of `package-lock.json` carry the same name and version and nothing else of the lockfile moved.
- Read from a probe application with each `package.json` (2026-11-18, Electron 44.3.0, Windows): the old one gave
  `app.getName()` `git-graphical-standalone`, `app.getVersion()` `0.1.0`, user data `%APPDATA%\git-graphical-standalone`;
  the new one gave `Trunks Graph`, `0.4.0` and `%APPDATA%\Trunks Graph`.
- The window title (`src/ui/index.html`), the empty screen's title (`src/ui/graph-table.ts`) and the utility
  process's service name (`trunks-graph-repository`, `src/app/repository-client.ts`) follow. Internal identifiers a
  person never reads (`GitGraphicalBridge`, `BRIDGE_GLOBAL_NAME`, `VIEW_GLOBAL_NAME`, test folder prefixes) are unchanged.

## The icon, for slice S05

- **The file the packager takes: `resources/icon.png`**, 512 by 512 pixels, RGBA, transparent corners, committed.
- **Regenerate it with `npm run icon`** (`electron resources/render-icon.cjs`). Electron, already a development
  dependency, loads `docs/images/logo.svg` into a hidden transparent window and captures it, so no dependency was
  added. Nothing in the build or the gates runs it.
- `scripts/build.js` copies it to `dist/icon.png`, and `src/app/window.ts` gives it to `BrowserWindow`'s `icon`,
  resolved from the built output's directory so it resolves the same once packaged.
- Looked at: the window of `electron .` was asked for its icon through `WM_GETICON` (big, small and the default
  kind) on Windows 11 on 2026-11-18, and each answer was the tree logo, 512 by 512, saved and viewed.

## The settings copy

- Electron names the user-data folder after the application, so the rename moved it. On a start where the user-data
  folder holds none of `theme`, `branch-selections`, `details-options` and `details-layouts`, the entries of those four
  that the sibling folder `git-graphical-standalone` holds are copied, before any store is opened
  (`src/app/settings-copy.ts`). The former folder is left as it is, nothing else in it is copied, and a failed copy
  is written to the standard error and does not stop the start.
- The decision is `entriesToCopy` (`src/contracts/former-settings.ts`, in the ring the mutation gate reads, with
  `former-settings.test.ts`). It copies nothing when the folder was given on the command line, and nothing when the
  folder already holds any of the four.
- **How the code knows the folder was overridden:** `app.commandLine.hasSwitch('user-data-dir')`.
- **How a test points the copy at a former folder of its own:** the environment variable `TRUNKS_GRAPH_APP_DATA`,
  read in `src/app/main.ts`, makes the user-data folder `<that directory>/<application name>`. `APPDATA` itself could
  not be used: a probe application with `APPDATA` set to another folder still read `%APPDATA%` of the real user
  (2026-11-18). `test/e2e/name-icon-settings.spec.ts` builds a temporary parent for every case.
- Measured by that spec: a former folder with a theme `dark`, a branch selection, details options, a details layout and
  two stray entries gave a first start whose `nativeTheme.themeSource` was `dark`, the four entries in the new folder
  and neither stray entry. The former folder was unchanged.
