# E07-M01-S02: the window, details and file actions that E04-M01's reviews carried

What a reader of the code needs. The specification is `TASK-S02-carried-window-details-files.md`, which is not in
history. Each item below is a finding E04-M01's review rounds classed as carried (`docs/PLAN.md`, *Carried past
E04-M01 from its reviews*). Every figure says who measured it and how; the executor of this slice measured all of them
on 2026-11-16 and 2026-11-17 in the built application on Windows 11, with git 2.56.0.windows.4 on the path, unless it
says otherwise.

## What changed, and why

- **C-15, a refusal labelled as git's failure.** `FailureKind` has a new member, `BadRequest` (`'bad-request'`): the
  request is not one the application answers, and was refused before anything ran. `readGitDetails` answers a target
  that is not one with it (`src/adapters/git-details.ts`), and `details:keep-layout` answers a malformed request with it
  (`src/app/handlers.ts`). An existing kind would have said the wrong thing: `GitFailed` is "git ran and reported a
  failure of its own", and `Cancelled` is "the user dismissed it or it was superseded". The headline the window shows for
  it is in `src/ui/status-text.ts`. The contract snapshot was recorded with `npm run contract:record`: the kind is the
  only line that changed.
  **Left as it was, and raised:** `finishCommitDetails` in `src/core/parse/commit-details.ts` answers "is not a commit of
  this repository" with `GitFailed` for a tree or a blob object name, after git exited 0 (the case of
  `git-details.spec.ts` that expects it). It is in `src/core/`, which this lane may not touch. The file action's own
  refusals in `src/app/handlers.ts` (`refused`) also still carry `GitFailed`; the task scopes the finding to the details
  path and `details:keep-layout`.
- **C-20, the bar at the minimum size.** The Branches control is the one that gives way: `.branches` in
  `src/ui/renderer.css` may shrink (`flex: 0 1 auto`, at least 80 pixels), and its box is held to its wrapper
  (`max-width: min(320px, 100%)`), so a long branch name ends in the ellipsis the box already had. The alternative, a
  larger minimum window, was not taken: it would make every smaller screen scroll for a repository that has one long
  branch. Measured by the executor in a window at its minimum size (704 CSS pixels of content, `setSize(100, 100)` is
  answered with the minimum), with a branch named `feature/` and four times `a-long-branch-name-`: before, the document
  was 924 pixels wide and the theme list ended at 924; after, it is 704 wide and the list ends at 696. The case is
  `test/e2e/window.spec.ts`; it was red on the base and green after.
- **C-37, an untrue comment.** The paragraph of `src/contracts/layout.ts` about the S-curve now says it holds with no
  details area open, and what holds beside one. Measured by calling `segmentLines` (`src/ui/geometry.ts`) for every
  assignment of lanes 0 and 1 to the vertices and segments of two rows (64 assignments), for the row above the area
  with the area below it and for the row below with the area above it (128 calls), and comparing each with the same call
  with no area: 8 differed, and each of the 8 ends in the row's own lane at the edge facing the area instead of
  half-way. This is an exhaustive pass over two rows and two lanes, not over every layout.
- **C-43, Open File through a junction.** `src/app/handlers.ts` resolves the repository's top level and the file's
  absolute path through every link and junction (`realpath`, or for a path that does not exist the deepest existing
  folder's, with the names below it as written) and refuses Open File and Copy Absolute File Path when the file is not
  below the top level. The message is the one shape the other refused actions use, in the files pane. Held by
  `test/e2e/file-actions-guards.spec.ts`, which makes a junction with `mklink /J` on Windows. Seen by the executor: before,
  Open File on `link/secret.txt` revealed the outside file (the window said nothing); after, the pane says
  "`link/secret.txt` leads out of the repository's working tree."
- **C-46, a message on the wrong pane.** Reproduced first: an action refused after the pane had moved on to the next
  commit put its message on that commit's pane (the case in `file-actions-guards.spec.ts`, red on the base, found by
  holding the main process's answer until after the click on the next commit). `src/ui/file-notice.ts` owns the line and
  counts what supersedes a reply: showing, clearing or asking again. A reply that arrives after any of them shows
  nothing.
- **C-54, the docked drag against its direction.** `heightAt` in `src/ui/details-controls.ts` lets a drag that does not
  shorten the kept height keep a height above the room: the room it is held to is the larger of the room and where the
  drag began. The panel still shows no taller than its room, because the stylesheet holds it (`--docked-height`).
  Measured by the executor with `details-docked-guarantees.spec.ts`: grown inline to its room the kept height was 645, and
  on the base an upward drag of 100 while docked read 597; it now reads 645 or more. A downward drag never raises it.
- **C-55, four guarantees held by no case.** `test/e2e/details-docked-guarantees.spec.ts` holds the docked height when
  the window shrinks (the panel is held to its room and the kept 400 comes back when the window grows), at most one
  redraw a frame across a drag spanning 20 frames (inline and docked), the Auto Center On readings beyond the centred
  row (the next row by an arrow, the previous by two, and a row too near the top), and every shown row at its closed
  content offset at a scroll that is not a whole number of rows. Each was planted red: see the audit.
- **C-56, the process count.** `settled` in `test/e2e/file-actions.spec.ts` waits until every git process in the Git
  trace that started has exited and none has started for a second. Measured by the executor with a process planted 400 ms
  after the answer: the unchanged case read red 1 of 3 runs, the new one 5 of 5.
- **C-58.** The test title in `src/contracts/details-layout.test.ts` is corrected. The `comment-e04-m01-s12` entry of
  `scripts/gates/size-budget.json` is corrected from a `git archive` of the base `4220d88` and of `57faf97`, the commit
  that wrote it: every figure reproduced except the renderer.js one, 43 827, which no commit of the lane gave (43 884
  at `57faf97` and at the lane's last commit). The slice document of S12 is not in this lane's boundary.

## Budgets

`renderer.css` moved from 12 288 to 14 336 by the margin rule (`comment-e07-m01-s02`): 12 315 bytes against 12 281 at
the base. The other budgets did not move: main.cjs 11 664, renderer.js 44 111, repository.cjs 39 485.

## What was not measured

- `gates:boundaries` could not be run in this worktree: its `node_modules` is a junction to the primary checkout's, and
  the tool resolves the real path, so every test file's import of `vitest` is refused. Nothing was refused except those.
- The effect of C-54's rule on a drag that crosses the room from above, and the Branches control on a machine with a
  different text scale, were not measured.
