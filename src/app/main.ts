import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

import { openDetailsStore } from './details-store';
import { registerHandlers } from './handlers';
import { createRepositoryClient } from './repository-client';
import type { RepositoryClient } from './repository-client';
import { openSelectionStore } from './selections';
import { carryFormerSettings } from './settings-copy';
import { startupRepositoryPath } from './startup';
import { openThemeStore } from './theme';
import { createMainWindow } from './window';

/**
 * The composition root.
 *
 * It owns the process lifecycle, builds the two things the application is made
 * of — a window and a client of the process that reads repositories — and wires
 * the channels between them. There is no rule here: nothing in this file parses
 * git's output, decides what a page is or knows which lane a commit is in
 * (`docs/ADR-0002-architecture-and-performance.md` decision 1).
 *
 * The built output is the application's own directory plus `dist`, which is
 * where the bundler puts the preload, the document, the renderer and the utility
 * process. Resolving it from `app.getAppPath()` rather than from the bundle's
 * own location keeps working once the application is packaged into an archive.
 */
function distDirectory(): string {
  return join(app.getAppPath(), 'dist');
}

/**
 * Where the user-data folder lives, when a caller says so by the environment
 * rather than by the command line: the folder is `<that directory>/<application
 * name>`, as Electron's own default is under `%APPDATA%`. The end-to-end suite
 * that proves the settings copy sets it, because Electron ignores the `APPDATA`
 * variable on Windows (measured by E07-M01-S04, 2026-11-18, with a probe
 * application) and `--user-data-dir` is the one thing the copy must refuse.
 * Set before `ready`, as the path has to be.
 */
const APP_DATA_VARIABLE = 'TRUNKS_GRAPH_APP_DATA';
const appDataDirectory = process.env[APP_DATA_VARIABLE];
if (appDataDirectory !== undefined && appDataDirectory !== '') {
  app.setPath('userData', join(appDataDirectory, app.getName()));
}

/**
 * The identity Windows groups the application's windows under on the taskbar.
 * The installer gives its Start-menu shortcut the packager's `appId`, and this
 * is the same string, so the running window and a pinned shortcut are one
 * button rather than two. `gates:packaging` holds the two equal. Electron
 * documents the call for Windows only (`@platform win32` in its typings), and
 * it is made here, before any window exists.
 */
const APP_USER_MODEL_ID = 'io.github.paulo-raoni.trunks-graph';
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

/**
 * The client, built when the application is ready rather than at module scope,
 * so that nothing asks Electron where the application lives before it knows.
 */
let client: RepositoryClient | null = null;

function openWindow(): void {
  createMainWindow(distDirectory());
}

function start(): void {
  client = createRepositoryClient(distDirectory());
  // The stored colour scheme is read and applied here, before any window
  // exists, so that the window's first paint is already in it (`./theme.ts`).
  const home = app.getPath('userData');
  // Before any store is opened: a first start under the new name brings the old
  // name's settings across (`./settings-copy.ts`), never into a folder the command
  // line chose.
  carryFormerSettings(home, app.commandLine.hasSwitch('user-data-dir'));
  const theme = openThemeStore(home);
  registerHandlers({
    client,
    startupPath: startupRepositoryPath(process.argv, app.isPackaged),
    windowOf: () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null,
    theme,
    selections: openSelectionStore(home),
    details: openDetailsStore(home),
  });
  openWindow();

  // macOS keeps the application running with no window, and reopens one when the
  // dock icon is clicked. Windows and Linux have no such state.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openWindow();
    }
  });
}

/**
 * The utility process is stopped with the last window, and again before the
 * application quits.
 *
 * Twice, because the two events are not the same one and neither implies the
 * other: on macOS the last window closing does not quit the application, and a
 * quit from the menu does not necessarily close a window first. A utility
 * process that outlives its window is this slice's characteristic leak, and
 * ending it is also how its memory is returned to the operating system rather
 * than waited for (decision 2). `stop` is safe to call twice and the next
 * request starts a new process, so nothing is lost by being early.
 */
app.on('window-all-closed', () => {
  client?.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  client?.stop();
});

void app.whenReady().then(start);
