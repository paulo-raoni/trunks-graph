# E07-M01-S05 · Windows installer and portable build

**Parent:** E07 Packaging and distribution > E07-M01 Windows build > E07-M01-S05 Windows installer and portable build

`npm run dist` builds two files of Trunks Graph 0.4.0 into `release/`: an installer that installs for the current
user without an administrator, and a portable executable that runs without installing. The installer adds **Open in
Trunks Graph** to a folder's context menu and to the menu of the empty space inside an open folder. None of this is
behaviour of Git Graph: E07 is standalone-only.

Every number below was taken by this slice's executor on 2026-11-21 on the development machine (Windows 11, 8
logical processors), unless it names someone else. **None was taken on a free machine** by `AGENTS.md` §11's measure:
with other projects' agents running, the mean total processor load, sampled every two seconds, was 74 to 100 per cent
over each timed or memory reading and over the minute before it (the loads are given with each).

## The packager

- **`electron-builder` 26.18.0**, a development dependency at that exact version. It is what npm's `latest` tag named
  on 2026-11-21, released on 2026-10-20 (`npm view electron-builder time`). 26.18.1, released 2026-10-26, is published
  under the `v26` tag only, not `latest`.
- **Its configuration is the `build` key of `package.json`**, not a separate `electron-builder.yml`. The packaging gate
  reads it with `JSON.parse`, and a YAML file would need a parser that is only a transitive dependency of the packager.
  The key does not ship: electron-builder deletes `build`, `scripts` and `devDependencies` from the `package.json` it
  packages (`ignoredPackageMetadataProperties` in `app-builder-lib/out/fileTransformer.js`, read), and the packaged
  `package.json` read out of the archive holds neither.
- **`appId` is `io.github.paulo-raoni.trunks-graph`.** `src/app/main.ts` gives the window the same id with
  `app.setAppUserModelId`, on Windows only. The installed Start-menu shortcut carries it as its
  `System.AppUserModel.ID`, read through the shell after installing.
- **The packaged application is `dist/` and `package.json`** (`build.files`), and `npm run dist` rebuilds `dist/` in
  production mode first, so the minified bundles the size gate weighs are what ships. `dist/` then holds the
  production build until the next `npm run build`. No `node_modules` is packaged: the application has no runtime
  dependency.
- **What the archive (`resources/app.asar`) holds**, read from its header (130 524 bytes of files, an archive of
  132 584 bytes):

  | folder | files, bytes |
  | --- | --- |
  | `dist/` | `renderer.js` 44 099, `repository.cjs` 39 691, `icon.png` 19 062, `main.cjs` 12 670, `renderer.css` 12 315, `preload.cjs` 1 389, `index.html` 886 |
  | root | `package.json` 412 |

- The icon is `resources/icon.png` (S04's). Nothing is published (`publish: null`), so no update file is written.
- The licence gate refused three packages under the packager (`sanitize-filename`, `truncate-utf8-bytes`,
  `utf8-byte-length`, WTFPL or WTFPL-or-permissive). Each is an exception in `licence-allow-list.json`, with its reason:
  build time only, never in the archive.

## The installer

- **One click, for the current user only** (`nsis.oneClick: true`, `perMachine: false`). Its manifest asks for
  `asInvoker` (read from the file), and here it ran to completion, unattended, from a shell that was not elevated. It
  installs into `%LOCALAPPDATA%\Programs\trunks-graph`, adds a Start-menu shortcut **Trunks Graph**, no desktop
  shortcut, an entry in Windows' installed apps (current user), and starts the application when it is done.
- **The person does not choose the folder. Argued:** in electron-builder 26.18.0 the folder page belongs to the assisted
  installer, and an assisted installer with `perMachine: false` also shows the page that offers an install for all users,
  which needs an administrator (`multiUser.nsh` and `assistedInstaller.nsh` of its NSIS templates, read). The one-click
  installer is the mode that never offers elevation, which is what the task asks for.
- **No elevation helper is installed** (`nsis.packElevateHelper: false`): the installed `resources/` holds `app.asar`
  only.
- **The uninstaller** (`Uninstall Trunks Graph.exe` in the program folder) removes the program folder, the shortcut, the
  installed-apps entry and the context-menu keys, and leaves `%APPDATA%\Trunks Graph` (`deleteAppDataOnUninstall:
  false`, the default, set to say so).

## The portable executable

`Trunks Graph 0.4.0 Portable.exe`. Every start unpacks the whole application into a folder under `%TEMP%`, runs it, and
removes the folder when the application exits (`portable.nsi`, read); the folder was gone after the last of the three
starts below. It adds no
context-menu entry: electron-builder includes `resources/installer.nsh` in the installer's script only
(`NsisTarget.js`, read), and the portable script calls no install macro.

electron-builder also puts its elevation helper `elevate.exe` into the portable's payload, and its portable options have
no switch for it. Listed with 7-Zip, the installer holds 72 files and the portable 73, the one more being
`resources\elevate.exe`. It is the packager's file, not one of this repository's.

## The context-menu entry

`resources/installer.nsh` is included by the installer (`build.nsis.include`). Its `customInstall` writes, and its
`customUnInstall` deletes, these keys and nothing else:

| key under `HKCU\Software\Classes\Directory\` | value | data |
| --- | --- | --- |
| `shell\TrunksGraph` | default | `Open in Trunks Graph` |
| `shell\TrunksGraph` | `Icon` | `<install folder>\Trunks Graph.exe` |
| `shell\TrunksGraph\command` | default | `"<install folder>\Trunks Graph.exe" "%V"` |
| `Background\shell\TrunksGraph` | the same three | the same |

`%V` is the folder in both menus. Read back from the registry after installing, the install folder was
`C:\Users\<user>\AppData\Local\Programs\trunks-graph`. On Windows 11 the entry is under *Show more options* (the
milestone's choice).

## The commands

- **`npm run dist`** builds `dist/` in production mode and both targets into `release/` (git ignores it; the line was
  already in `.gitignore`). It took 14 min 9 s the first time, on the loaded machine. It downloaded 5.6 MB of tools
  (NSIS, its resources, 7-Zip, the icon converter) into `%LOCALAPPDATA%\electron-builder\Cache`, and took Electron
  44.3.0 from Electron's own download cache, where its zip already was.
- **`npm run gates:packaging`** (`scripts/gates/packaging.js`, its cases in `test/gates/packaging.test.ts`) packages
  both targets the same way into a temporary folder, removes it, and rebuilds `dist/` in development mode. It fails
  unless: both files exist; they and the application executable name the product `Trunks Graph` and version 0.4.0 in
  their file version information (read by Windows' `FileVersionInfo`); the archive holds `package.json` and files under
  `dist/` and nothing else, with nothing beside it but the packager's `elevate.exe`; the include file writes and deletes
  exactly the keys above; and `src/app/main.ts` gives the window the packager's `appId`. It installs nothing. The
  release it expects is written in the gate, not read from `package.json`, so a wrong version planted there goes red;
  moving the version moves that line. A green run took 10 min 34 s.
- **A failed run of either exits 1.** electron-builder's temporary-file cleanup (`async-exit-hook` 2.0.1) ends the
  process with `process.exit(0)` once the event loop empties, which replaced the exit code the gate had set: the first
  red run of the gate printed six findings and exited 0. `failOnExit` in `scripts/dist.js` sets the code again in an
  `exit` listener, which Node reads after the listeners have run; a script that loaded the same hook and set the code
  exited 0 without it and 1 with it.
- The archive is read in `win-unpacked/`, the folder both targets are compressed from: the `app.asar` 7-Zip took out
  of the installer and out of the portable had the same SHA-256 as that folder's.

## Measured

### Sizes, and ADR-0001's trigger

| what | bytes |
| --- | --- |
| installer `Trunks Graph Setup 0.4.0.exe` | 120 256 916 (114.7 MiB) |
| portable `Trunks Graph 0.4.0 Portable.exe` | 109 374 722 (104.3 MiB) |
| installed folder, 73 files, sum of their lengths | 385 460 134 (367.6 MiB) |
| installed folder, allocated at the volume's 4 KiB clusters | 385 617 920 (367.8 MiB) |

Method: file lengths read with PowerShell `Get-ChildItem -Recurse`; allocation is each length rounded up to the
volume's 4096-byte block size, which `Win32_Volume` reports. The largest parts of the folder are the Electron
executable, renamed `Trunks Graph.exe`, 246 070 272 bytes; `locales/` 50 643 609; `dxcompiler.dll` 25 744 896;
`LICENSES.chromium.html` 20 472 830; `resources.pak` 12 435 445; `icudtl.dat` 10 876 560. This application's own
archive is 132 584 bytes of it.

**ADR-0001's 250 MB installed is crossed**: 385.5 MB (367.6 MiB) installed, about 54 per cent over, whichever of the
two units the ADR means.

### Resident memory

Every process of the application runs the installed `Trunks Graph.exe`, so the processes read are those whose
executable is that file (`Win32_Process`). For each: the working set (`WorkingSetSize`, the resident memory the process
reports), the private working set (`Win32_PerfFormattedData_PerfProc_Process.WorkingSetPrivate`, resident pages no other
process shares) and private bytes (`PrivatePageCount`, committed memory). A reading was taken once the summed working
set had moved by under 2 per cent over 30 seconds, read every 5 seconds (33 to 78 seconds after the state was reached).
MB below is 10⁶ bytes, MiB 2²⁰.

| state | how started | readings | working set, summed | private working set, summed | private bytes, summed |
| --- | --- | --- | --- | --- | --- |
| idle, no repository, 4 processes | Start-menu shortcut | 5 | 285.0 to 291.1 MiB (299 to 305 MB) | 70.7 and 72.9 MiB (2 readings) | 108.1 to 111.6 MiB |
| idle, no repository, 4 processes | Playwright | 1 | 307.9 MiB | 75.9 MiB | 113.7 MiB |
| 50 000 commits loaded, 5 processes | Playwright | 6 | 328.7 to 414.5 MiB, median 403.4 (345 to 435 MB, median 423) | 80.9 to 100.6 MiB (3 readings) | 148.8 to 158.9 MiB (156 to 167 MB) |

The 50 000-commit state is the budgets' memory case's: the shared fixture `huge` of the end-to-end suites (50 000
commits, shape `large`), opened on the command line, then every remaining commit asked for over the bridge and shown,
as `test/e2e/budgets-memory.spec.ts` does; the list then measured 50 000 rows. That needs a driver, so those readings
were taken with Playwright attached to the installed executable (`_electron.launch` with `executablePath`), which
starts it with `--inspect=0 --remote-debugging-port=0` (Playwright 1.63.0's `coreBundle.js`, read). At idle the
driver's start read 19.6 MiB (20.6 MB) more working set than the median plain start: one reading, so that figure is an
estimate. The fifth process is the one that reads git. Load: 87 to 100 per cent mean total during the 50 000-commit readings, 83 to 98 during the
idle ones.

**ADR-0001's 400 MB resident with 50 000 commits loaded is reached, not clearly crossed.** As read, the summed working
set was over 400 MB in five readings of six (median 423 MB). Less the driver's estimated 20.6 MB, three of six stay
over and the median is 402 MB, a margin smaller than the readings' own spread. The summed working set counts a page
that several processes share once in each of them; private bytes, which count nothing twice, were 156 to 167 MB. The
machine was not free, and Windows trims working sets on a loaded machine (the 345 MB reading), so a free-machine
reading could land on either side. The ADR's own estimate for idle, "about 120 to 200 MB across its processes", is
below the 299 to 305 MB summed working set read here.

### Time to the window

From a shell start to the application's first visible top-level window: PowerShell `Start-Process` on the target, which
starts it through ShellExecute (that Explorer does the same on a double click is an inference), then `Get-Process`
polled until a `Trunks Graph` process has a main window, every 20 ms plus the poll's own cost (about 100 to 200 ms on
this machine, so the figures are good to about 0.2 s). Each reading was preceded by a minute with no application
running.

| started from | readings, ms | total load, mean during each |
| --- | --- | --- |
| the installed Start-menu shortcut | 2 999, 1 223, 859, 1 541, 1 009 (median 1 223) | 96, 83, 96, 98, 90 per cent |
| the portable executable | 23 130, 63 103, 56 592 (median 56 592) | 93, 100, 100 per cent |

The portable is slow because every start first unpacks the whole application, 385 MB, into `%TEMP%`. How much of
that is the load is not known: no free stretch came.

## Run and looked at

**Not looked at with eyes.** The Explorer window, its menus and the application's window were not seen: access to File
Explorer and Trunks Graph through computer use was asked for in this session and refused. Everything below was read
from the shell, the registry, git's trace and the application's page, on 2026-11-21, with a scratch repository of four
commits (a merge of a side branch) under the executor's scratch folder.

- **Installed** as the current user from a shell without elevation: the installer exited 0 after 44 s and the
  application started (4 processes). The keys, the shortcut's target and its `System.AppUserModel.ID` were read back as
  described above.
- **Folder menu.** The shell's own list of the folder's menu items (`Shell.Application`, `FolderItem.Verbs()`) held
  `Open in Trunks Graph`. Invoking it started `"…\trunks-graph\Trunks Graph.exe" "<the folder>"`; a window appeared after
  9.9 s, and with `GIT_TRACE2_EVENT` set the application's repository process ran `git --version` and five commands with
  `-C <the folder>`: `rev-parse`, `stash list`, `log`, `for-each-ref`, `status`.
- **Background menu.** The menu the shell builds for the empty space of that folder (`IShellFolder::CreateViewObject`
  asked for `IContextMenu`) held `Open in Trunks Graph`. Invoking it through `IContextMenu::InvokeCommand` started the
  same command line; a window after 3.1 s, the same six git commands on the same folder.
- **Start menu.** Opening the shortcut started the application with no argument; a window after 1.6 s, and no git
  command ran. Opening a repository from that window was driven with Playwright on the installed executable: the folder
  dialog answered with the scratch repository and *Open Repository* pressed. The bar then read the repository's path,
  the list held 4 rows, and the first read `main`, `merge side into main`. The installed executable started with the
  repository's path on its command line showed the same.
- **Uninstalled** with the installed uninstaller as the current user. Run as a person runs it, it first asks for
  confirmation (an OK or Cancel box, `areYouSureToUninstall` in its template; seen here only as a window titled
  *Desinstalação do Trunks Graph*); that run was cancelled by ending it, and the uninstaller run again with `/S`, which
  skips only that box. Then the program folder, the shortcut, both context-menu keys, the installed-apps entry and the
  installer's own key under `HKCU\Software` were gone; `%APPDATA%\Trunks Graph` was still there; and neither shell menu
  listed the entry any more. A second install and uninstall gave the same listing.
- **Portable** run three times (above) and closed each time; its unpacked folder was gone after the last.
- **Settings carried from the old name, seen on the installed application.** On a first start with no
  `%APPDATA%\Trunks Graph`, the start the installer makes when it finishes carried nothing over from
  `%APPDATA%\git-graphical-standalone` (whose `branch-selections` the copy should bring), and neither did a start through
  `explorer.exe` opening the shortcut, nor one through `explorer.exe` opening a command file that captured the standard
  error, which stayed empty. A start of the same executable directly from PowerShell on an absent folder carried
  `branch-selections`, and so did the next start after a start that had carried nothing. Why the start through Explorer
  copies nothing is not established. `src/app/settings-copy.ts` is S04's and outside this slice.

## What this slice did not do

- Nothing is signed (the milestone's choice). What SmartScreen shows for a downloaded copy was not tried here.
- No single-instance lock (out of scope). Not exercised: every start above was made with no window of the application
  open.
