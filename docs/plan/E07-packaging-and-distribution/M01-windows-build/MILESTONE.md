# E07-M01 · Windows build

**Epic:** E07 · Packaging and distribution
**Base tag:** v0.3.0
**State:** in flight

## Goal

A Windows installer and a portable executable of **Trunks Graph**. Each carries the application's own name, icon
and version. The installer also adds an entry to a folder's context menu in Explorer that opens that folder's
repository. The milestone is promoted as **v0.4.0**.

Before that, the first wave takes every finding E04-M01's reviews carried to the next milestone (`docs/PLAN.md`,
*Carried past E04-M01 from its reviews*, `AGENTS.md` §7).

## Slices

| ID | title | wave | outcome |
| --- | --- | --- | --- |
| S01 | carried: the git adapter | 1 | E04-M01's carried findings in the git adapter repaired: a stash's own commits kept off a branch made on it, `--stdin` given only with names, and the adapter suites' names and setup held. |
| S02 | carried: the window, details and file actions | 1 | E04-M01's carried findings in the window repaired: failures labelled by their cause, the bar whole at the minimum size, a message on its own pane, Open File kept inside the repository, and the docked height kept against the drag. |
| S03 | carried: suites, budgets, gates and sentences | 1 | E04-M01's carried findings in the end-to-end suites, the budgets gate, the mutation gate and the committed sentences repaired or measured. |
| S04 | the name, icon and version | 2 | The application calls itself Trunks Graph everywhere a person reads it, shows the tree icon, reports version 0.4.0, and keeps the settings a person made under the old name. |
| S05 | Windows installer and portable build | 3 | `npm run dist` builds a per-user installer and a portable executable, and the installer adds and removes an "Open in Trunks Graph" entry on a folder's context menu. |
| S06 | progress while a repository opens | 3 | While a chosen repository opens, the window says which one is opening and shows that work is going on, and the person can cancel it; the time an open takes is measured on large repositories. |
| S07 | branch labels as the reference shows them | 4 | A branch name's pointer and its box match what the reference extension was observed to show, and its text can still be selected the way the reference allows. |

**S06 was added on 2026-11-17 from the owner's report.** Running v0.3.0 from source on another machine, the owner chose
a second repository with Open Repository. The folder dialog appeared and a folder was chosen. Then the window gave no
sign of progress: the previous graph stayed, and only the button changed, to *Opening…*, disabled. The owner could not
tell whether the application had hung, how long it would take, or where it was going, and called it a serious defect.
The owner reported afterwards that the repository did open in the end; how long it took was not recorded.
The orchestrator placed it in this milestone, so that the first installer does not ship with it.

**S07 was added on 2026-11-17 from the owner's report**, on the same run. It runs in a fourth wave because it and S06 both change `src/ui/renderer.css`, and lanes of one wave share no file (`AGENTS.md` §5):

- Over a branch name in the graph, the pointer is the text cursor, where the owner expects the hand that says a click
  acts.
- The branch names are drawn inside dotted boxes.

The owner asked for both to match the reference extension, recalled from memory, which is not evidence. The slice
observes the extension first (`AGENTS.md` §7, *Open the actual thing*) and records what it shows in its own words.

**Carried findings closed without a lane, by the orchestrator on 2026-11-16, for the owner to overrule:**

- C-27 and C-34 name commit messages in pushed history (`d494568`, `7c739c8`). History that is pushed and tagged is
  not rewritten (`AGENTS.md` §8). Nothing is left to repair.
- C-33 names an audit file. Audit files were deleted at the promotion of v0.3.0 (`AGENTS.md` §4), so none remains to
  correct.
- C-41 records that E04-M01-S10 changed S09's `closeDetails` outside its scope, and that S09's guarantees were kept.
  It names no defect.
- C-53, a grown inline details area whose drag handle sits below the window's foot: **kept as it is.** The handle
  is reached by scrolling, like any area taller than the window. Clamping the area's height from the row's place
  would make the kept height depend on where the list was scrolled when it was dragged.
- C-40 and C-52, whether `AGENTS.md` carries a standing allowance for an executor to replace its own commits: the
  contract is the owner's (`AGENTS.md` §2), so they stay in `docs/PLAN.md` §7 as an open owner decision.

**The orchestrator's choices, for the owner to overrule:**

- C-54 is repaired in S02. A drag never moves the kept height against its own direction.
- The packager is `electron-builder`. It makes a per-user NSIS installer that needs no administrator, and a portable
  executable, from one configuration.
- The builds are **not signed**. Windows SmartScreen warns on first start until a signing certificate is bought;
  buying one is the owner's decision because it costs money.
- The new name moves the settings folder. S04 copies the settings a person made under the old name on the first
  start under the new one, and leaves the old folder in place.
- The context-menu entry uses the classic shell keys under the current user. On Windows 11 it is listed under
  *Show more options*. A top-level entry needs a packaged shell extension, which is out of scope.
- The version is 0.4.0, the tag this milestone is promoted under.

E07 is standalone-only, so no slice has reference behaviour to observe (`docs/PLAN.md` §2). The context menu was
asked for by the owner on 2026-11-04. Opening the repository a path names already works: `src/app/startup.ts`
reads it from the command line.

Scope and boundary of each slice live **only** in its task file (`AGENTS.md` §3).

## Gates

Every gate of `docs/ADR-0003-quality-gates-and-ci.md` §2, run through the tiered scripts of `AGENTS.md` §11:
`npm run gates:static`, `npm run gates:quick` and `npm run gates`. The wall-clock budgets are a gate of their own,
`npm run gates:budgets`. Each task names its lane's tier. The reviewer runs `npm run gates` and
`npm run gates:budgets` at every round (`AGENTS.md` §7, §11). S05 adds the packaging check its task names, and the
reviewer runs that as well.

Always, for every slice (`TASK_TEMPLATE.md`): the boundary check, the commit check, the placeholder check,
and `git status --short` printing nothing.

## Delivery record

Filled in before promotion (`AGENTS.md` §8.5).

| field | value |
| --- | --- |
| base tag | v0.3.0 |
| reviewed commit | |
| review rounds | |
| tasks | |
| tag created | |
