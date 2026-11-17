# E07-M01-S03 · Carried: suites, budgets, gates and sentences

**Parent:** E07 Packaging and distribution > E07-M01 Windows build > E07-M01-S03 carried: suites, budgets, gates and
sentences

This slice repairs the findings E04-M01's review rounds carried, in the end-to-end suites, the budgets gate, the
mutation gate, the performance baselines and the committed sentences of five slice documents. None is a defect a person
using the application meets: each made a check prove less than it claimed, or a sentence say more than was measured. No
file of `src/` changed. Nothing here is behaviour of Git Graph.

Every number below says who took it. **Taken by this slice's executor on 2026-11-17** unless named otherwise, on a
machine other projects' agents were using: the processor load sampled beside each reading is given where it matters, and
none of the readings was taken on a machine free by `AGENTS.md` §11's measure (40 per cent mean, no sample over 75).
Those that are counts, not times, are not governed by that rule.

## What changed, by finding

| finding | what changed | how it was held |
| --- | --- | --- |
| C-06 | `keyboard-cost.spec.ts` never removed its trace directory; now removed. `budgets.ts`, `budgets-git`, `budgets-start`, `details-dropped...` and `branches-dropdown` remove theirs after the process has ended | counts below |
| C-17 | `support/profile.ts`: `ended` stops the whole process tree (`taskkill /t`) when the main process did not exit; `removeProfile` retries while the error says a handle is held, until a deadline, instead of twenty tries a hundred ms apart | `test/fixtures/profile.test.ts`, probes below |
| C-11, C-50 | the first-page waits of `selection-kept.spec.ts` and `branches-dropdown.spec.ts` have no limit of their own; the case's limit bounds them | measurements below |
| C-16 | the theme suite's canvas case waits for a counted clear of the canvas, however scheduled, then lets the page settle | probe below |
| C-48 | `keyboard-moves.spec.ts`: an arrow at the first or the last row with the details open leaves the list unscrolled | probe below |
| C-51 | `details-lines.spec.ts` prints the registered callbacks of its idle window; twelve readings taken | below |
| C-57 | the loading note is read from `src/ui/details-area.ts` by `support/source-text.ts` | read, probe below |
| C-24 | fixture `crossing-curve` and its golden image | looked at, probe below |
| C-38 | fixture `moments` and a case in `details-dropped-and-listed-branches.spec.ts` | three probes below |
| C-09 | `budgets-frames.spec.ts` takes up to three readings and fails, saying why, when all were discarded | below |
| C-31 | `support/reference-bound.ts`: the percentile is taken to the clock's 0.1 ms grid, and that figure is compared and printed | unit check |
| C-22 | the failing-tests and failing-files counters of the re-measure clause are exported and held; the own-crash verdict has a case | probes below |
| C-30, C-32 | the unit of `gitProcessesPerOpen` lists the commands of both cases; `openedProcessesOf` reads them; the processes counted are held to them | probes below |
| C-21 | a re-measured verdict carries the memory free and says when it was read under memory pressure | probes below |
| C-35, C-39, C-44, C-45, C-49, C-58 | sentences of the S06, S10, S11, S12 and S17 documents | each says what was read or measured |

## Measurements

**Git processes at open (C-30, C-32).** `GIT_TRACE2_EVENT` on a three-commit repository, opened four times, twice with
a stash and twice without: 6 processes without (`--version`, `rev-parse`, `stash list`, `log`, `for-each-ref`,
`status`), 7 with, identical in both pairs. The seventh is a `log -g` of `refs/stash` that git's own `stash list`
starts. It does not repeat work another process of the application did, so it is not a product finding; it is the cost
of asking git for the stash list. The `stashes` fixture read the same 7 in the case added to `budgets-git.spec.ts`.

**Idle frames (C-51).** Twelve runs of the idle case at Base's logic, load sampled over each at 40.5 to 98.5 per cent:
the callbacks registered were `requestAnimationFrame` 15, `setTimeout` 0, `setInterval` 0, `requestIdleCallback` 0 before
the 2 000 ms idle window and the same after, in all twelve, all green. That establishes 15 as what the page has
registered at that point at this commit and that an idle window registers none, under heavy load. It does not establish
why E04-M01-S12's second-session head read 14: that is a count from before this commit and the readings here cannot say
what differed. The case holds equality across the window and no number.

**Timer grid (C-31).** Over two million reads of `performance.now()` in this application's renderer, the smallest
nonzero step was 0.1 ms.

**Memory and the mutants of `hash-index.ts` 120:7 (C-21).** The per-mutant command run alone in a copy of the tree, a
watchdog stopping it under 700 MiB free. 4 028 MiB free at the start, `true`: the column's own `RangeError` in 64.5 s,
free memory down to 1 143 MiB; 5 246 MiB, `<=`: the same in 60.0 s, down to 1 133 MiB. With a 3.5 GiB ballast leaving
2 230 MiB free, `true` was stopped by the watchdog at 21.3 s with 666 MiB free and no verdict. Two further attempts
began with 420 and 69 MiB free and were stopped within two seconds. **The paging case was not measured**: letting the
mutant run past the watchdog would have starved the other projects' agents on the machine. The verdict was therefore
not made independent of memory; the gate says so when it was read under pressure. The threshold, 1 024 MiB, is a choice.

**Saturated load (C-11, C-50).** See the section at the end, filled from the run recorded there.

## Probes (`AGENTS.md` §7)

Each was planted, run red, removed and run green.

- `ended` without `/t`: 2 of 3 cases of `profile.test.ts` red; `removeProfile` one attempt: 1 red. A first version of the
  check passed against both: a new process does not hold its working directory the instant it exists, so the check now
  waits for the child to say it started.
- Canvas: the redraw counter not counting: the theme case timed out at 30 s on `Expected: > 0, Received: 0`.
- Arrow at an edge: a `keydown` listener scrolling the list by 5 pixels: `Expected: 6850, Received: 6845`.
- Crossing curve: the renderer's `bezierCurveTo` replaced by `lineTo` in `dist/` (not in `src/`): both golden cases
  DIFFERENT. The graph was looked at before the image was recorded: the curve from lane 2 to lane 0 crosses the vertical
  of lane 1 in row 3.
- Moments: `&&` of `sameMoment` replaced in `dist/` by `||`, by time alone and by offset alone: red on *one instant at
  two offsets*, *two instants at one offset* and *one instant at two offsets*.
- Re-measure: the failing-files counter never matching, the start anchor removed, the gate's copy of the counter
  changed, the memory threshold set to 0, the outer-clock test removed, the note dropped from the line: each red in the
  case written for it.
- Unit lists: a `log` removed from the with-stash list and a command removed from the without list: red in
  `baselines.perf.test.ts` and in `budgets-git.spec.ts`.
- Scrolled budget: run once on this loaded machine (load mean 42.4 per cent, samples to 89): all three readings
  discarded (reference percentile 6.5, 6.3 and 7.4 ms against 4) and the case failed with *no reading was kept*. The
  green of a kept reading is in the audit if the machine allowed one.

## What the lane did not do

S02 holds `details-kept.spec.ts`, `commit-details.spec.ts` and `file-actions.spec.ts`, which create their own temporary folders; this lane did not read or change how they remove them. No time limit was moved anywhere.

## Saturated load (C-11, C-50), measured

Eight busy threads (one per processor) beside `selection-kept` and `branches-dropdown`, run together, with the total
processor load sampled every two seconds: 100 per cent in every sample shown of the first 100, over a run of 8.2
minutes. All 12 cases passed. Durations, seconds: `branches-dropdown` 30.1, 48.4, 27.7, 51.4, **156** (*Refresh and
Load More keep the selection*), 24.1, 38.1; `selection-kept` 14.7, 19.2, 12.3, 15.8, 22.8. The same two files run with
the others' load at a mean of 88 per cent (a loaded machine, no burners) took 4.9 to 14.6 and 9.6 to 18.8 seconds a
case. The worst case under saturation used 156 of its 180 seconds. So **the 180 s limit was not moved** (nothing
measured needed it, and 24 seconds is a narrow margin that a heavier load could take), and no 30 s action wait exists in
`branches-dropdown.spec.ts` at Base (its waits are Playwright's: none for actions, 10 s for `expect`); what it
waited on at 30 s in E04-M01's round 02 is not recoverable from this tree. The first-page waits, the one thing named, no
longer have a limit of their own. That a run which went red at 10 s in round 13 would now pass is **not shown**: this
run did not reproduce a failure at either Base or head.
