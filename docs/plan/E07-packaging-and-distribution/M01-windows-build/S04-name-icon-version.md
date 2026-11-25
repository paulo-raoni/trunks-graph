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

## What the start costs: measured by E07-M01-FIX-05

This section answers REVIEW-05 finding B-06 (the empty-repository cold start read slower than `v0.3.0`). It states
what was measured, by whom and how, and what it does and does not establish. **Nothing in S04 was found to cost the
start, and nothing was changed in the product.**

**Whose figures.** The reviewer's series of review round 05 (not reproduced here, not repeated by this lane): `v0.3.0`
read 2353, 2138, 2046, 2320 and 2349 ms (median 2320, spread 307) against `7748123`'s 2338, 2998, 2707, 2787 and
2353 ms (median 2707, 387 worse), at 72 to 80 % load. Everything below was read by the executor of E07-M01-FIX-05 on
2026-11-25.

**Method.** Every reading is the figure of `cold start to a painted window, empty repository` (the fastest of ten
launches, `test/e2e/budgets-start.spec.ts`), run as `npx playwright test --project=budgets -g "empty repository"` from
PowerShell in a built tree. A series alternates two arms, `A` first, five readings of each, the number fixed before it
started and never extended. Load is the processor's `_Total` percentage read through `Win32_PerfFormattedData_PerfOS_Processor`
every two seconds or so for the whole of each reading; it counts everything on the machine, the reading's own
processes included, which the rule of `AGENTS.md` section 11 excludes, so it is an upper bound on other work. No reading is
discarded. Each verdict is `AGENTS.md` section 11's: the head is red when its median is worse than the other arm's median by
more than that arm's spread. Every reading also failed the absolute limit of 1500 ms, as every reading of the case does on
this machine at 65 to 97 % load; that is carried (REVIEW-05 C-13) and is not what these series decide.

**Which pieces run in the case.** The case launches with `--user-data-dir=<its own folder>`
(`test/e2e/support/budgets.ts`, `launchBudgeted`), so `carryFormerSettings` refuses to copy (it lists the two folders and
returns) and the settings copy never does file work in it. `setAppUserModelId` and the window `icon` run. The open of
the empty folder runs the `endedBy` scope added by S06, whose first step is `reader.describe()` (`repository-host.ts`,
`endable`). Read from the diff `v0.3.0..7748123`, not measured, is that the renderer also grew (`src/ui/opening.ts`,
`shell.ts`, CSS), which is outside this lane's boundary and which none of the probes below removes.

**1. Can the case tell identical products apart?** Both arms the same build (`7748123`, the Base tree): A 2303, 2202,
2157, 2390, 1970 (median 2202, spread 420); B 2132, 2222, 2080, 2274, 1992 (median 2132). B is 70 ms *faster*: green.
Load 67 to 80 % on average per reading, 96 to 100 % at the highest sample. This one series did not read red on
identical products; it does not show that none would, since the spread of five readings of one product here is 282 to 420 ms.

**2. Each piece taken out.** The head against the head with one piece skipped by a switch in an uncommitted probe build
(never committed, reverted), five readings of each, the order A (head), B (piece out):

| piece out | A, head (ms) | B, piece out (ms) | B median less A median | A spread | verdict |
| --- | --- | --- | --- | --- | --- |
| `carryFormerSettings` | 2028, 2216, 2084, 1997, 1900 | 2446, 1901, 1940, 1942, 2235 | -86 | 316 | green |
| `setAppUserModelId` | 2137, 2156, 2060, 2212, 2367 | 2393, 2114, 2117, 2391, 2302 | +146 | 307 | green |
| window `icon` | 2443, 2360, 2561, 2240, 2426 | 2221, 2252, 2201, 2388, 2299 | -174 | 321 | green |
| `reader.describe()` before the read | 2114, 2270, 2544, 2426, 2288 | 2368, 2390, 2220, 2384, 2324 | +80 | 430 | green |
| all four | 2359, 2366, 2364, 2188, 2128 | 2254, 2234, 2209, 2181, 2336 | -130 | 238 | green |

Load per reading 64 to 88 % on average. In the last row the third A reading (2366 ms, load 82.8 %) is from the case's
raw output: its line of the series log was lost, by the executor reading that log while it was written. Two of the five
differences have the sign of a piece that costs time and three the opposite sign, and every one is inside the spread;
with all four out the head is not faster by more than that spread either. These series establish that none of the four
costs the start by an amount this case can see at this load (an inference from the spreads of 238 to 430 ms), not that
each costs nothing.

**3. The head against `v0.3.0`, twice.** A is the tag tree built at `v0.3.0`, B the Base tree, each series fixed before
it started:

- First series: A 2251, 2032, 2348, 2151, 2312 (median 2251, spread 316); B 2380, 2269, 2539, 2687, 2137 (median 2380).
  B is 129 ms slower: green. Load 77 to 97 % on average per reading.
- Second series: A 1995, 1979, 2378, 2388, 1776 (median 1995, spread 612); B 2009, 2325, 2593, 1794, 1702
  (median 2009). B is 14 ms slower: green. Load 65 to 89 % on average per reading.

**What this establishes, and what it does not.** The reviewer's red series was not reproduced in two series of the same
design, which read the head 129 and 14 ms slower than the tag where the reviewer read 387. The medians of five readings of
the same build (the head arms above) range from 2009 to 2426 ms across these series, 417 ms, so a real cost under about
0.3 s is not visible to this verdict at this load (an inference from that range), and the reviewer's 387 ms is just beyond it. Whether
the milestone's start-up work costs a person about 0.4 s for an empty window is therefore **not established either way**;
what is established is that no piece in this lane's boundary was found to account for it and that the red did not
come back. The absolute limits were not read on a free machine (none was available; REVIEW-05 C-13 stands).
