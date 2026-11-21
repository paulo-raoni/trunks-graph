# E07-M01-S06 · Progress while a repository opens

**Parent:** E07 Packaging and distribution > E07-M01 Windows build > E07-M01-S06 progress while a repository opens

While a repository opens, the window says which folder is opening, shows that work is going on, and offers
Cancel, which Escape presses too. A cancel ends the wait at once, ends the git processes still reading for that
open, and leaves the window exactly as it was. The reference extension has no Open Repository command, so none of
this is behaviour of Git Graph (`docs/PLAN.md` §2).

## What a person sees

- **The notice** (`src/ui/opening.ts`) is a card in the middle of the area under the bar, over a veil that
  dims whatever that area shows: the previous graph, the empty screen, or a failure. The card holds a ring
  that turns once every 0.9 s, the words *Opening repository*, the folder's own name in bold, its whole path in
  the monospace face the bar uses, and a Cancel control. Its middle is where the folder chooser stood a moment
  before, which is where a person is looking when the chooser closes.
- **Placed and sized as measured** on 2026-11-21 with the built application in an 1100 by 700 window over the
  50 000-commit repository: the card was 423 by 135 pixels at 338, 304, inside the area under the bar at 0, 42,
  1100 by 658. The veil is the window's own background at 72 % opacity, read back as `color(srgb 1 1 1 / 0.72)`
  in the light scheme and `color(srgb 0.121569 0.121569 0.121569 / 0.72)` in the dark one; the card uses the raised surface and line
  colours every other panel uses. Screenshots of both schemes were taken and looked at, and are not committed.
- **The previous graph stays, dimmed and inert**, and the bar's path is dimmed to half opacity. It stays so
  that a cancel puts back exactly what a person saw: nothing in the view is changed before the task that draws a
  reply, so a cancel finds it at the same scroll and with the same details open (read from the code; the
  end-to-end cases check the path, the first row and the next page). It is
  dimmed so that nothing suggests it is the repository opening, and inert (no click, focus or scroll reaches it)
  because a request made from it while another repository opens could be answered from the one opening, once
  that one's read has replaced it in the utility process. That last is an inference from
  `src/app/repository-host.ts`, *What can be in flight at once*, not a sequence this slice produced.
- **The Open Repository control** still says *Opening…* and is disabled, as before. An open named on the command
  line now shows the same notice and holds the same control, so one open is in progress at a time and a cancel
  has exactly one to cancel. Refresh, the Branches control and the theme control keep their behaviour.
- **For assistive technology**, the sentence *Opening* followed by the folder's name and path is written into a
  polite live region (`aria-live="polite"`, `aria-atomic="true"`) that stays in the page, empty, between opens,
  and it is written once per open. It is not a `status` role: the notices strip under the bar is the window's
  one `status`, and a test of that strip finds it by that role. Announcement was not checked with a screen
  reader.
- **Less motion:** under `prefers-reduced-motion: reduce` the ring does not turn; it fades between full and
  30 % opacity every 2 s.

## What a cancel does

1. **In the window**, at once and in the same task as the key or the click: the notice goes, the content under
   it is usable again, and the Open control is at rest. Nothing of the session, the view or the bar had changed
   before the task that draws a reply, so there is nothing to undo. Any reply of the cancelled open that arrives
   later ends the open's work where it waits (`Answer` of `src/ui/opening.ts`) and is never drawn.
2. **In the main process** (`registerOpenHandlers`, `src/app/handlers.ts`): every open is numbered as it arrives,
   and a cancel cancels every open numbered so far. An open cancelled before it was asked of the utility process
   is never asked; one whose reply comes back after the cancel answers `cancelled`. The cancel is passed on only
   once the open has been asked there, so it arrives after the open on the same channel.
3. **In the utility process** (`cancelOpen`, `src/app/repository-host.ts`): every open asked before the cancel is
   dropped when its read returns. If the cancelled open's read had already put its state in place, the state it
   replaced is put back, as loaded, so Refresh, Load More and a commit's details read the repository the window
   still shows. Then every open's or selection's read that is not for the state now open is ended.
4. **git is ended, not left to finish.** A read is run inside `endedBy` of `src/adapters/git-process.ts`, which
   carries an abort signal through every `await` to each git process the read starts, and kills each when the
   signal aborts; one not started yet is never started. The page adapter and the port take no signal, and are
   outside this slice; the carried signal reaches them without changing either.

**Why ended rather than discarded.** A person cancels an open because it is slow, and the measurements below
put almost all of a slow open in git. A discarded read runs to its end anyway: 3.3 to 6.7 s of `git log` on the
Linux kernel's history in the readings below, sharing the machine with whatever is opened next. Ending it costs
one `AsyncLocalStorage` and one abort listener per git process. What ending does not reach is a program git
itself starts, such as a hook: in a probe of this lane, killing a `git` that was running a shell alias left the
alias's shell holding git's output for 18 s more, and the end-to-end case whose repository has a sleeping
`core.fsmonitor` hook waits for the hook to be gone before it ends.

**Proved by command line** on 2026-11-21, with the application's `PATH` starting with Git for Windows' `cmd`
folder, as a PowerShell session's `PATH` on this machine does. In each of three attempts a window showing the
50 000-commit repository opened the Linux clone; the query of `Win32_Process` for `git.exe` whose command line
names the folder found two processes, `cmd\git.exe` and the `git.exe` it started, both running the open's
`log`, before Escape was pressed 4.5 to 5.8 s into the open. Right after Escape the window showed the
50 000-commit repository again with the Open control at rest, and the same query, 4.3 to 5.2 s after Escape,
found none. Before that, a script that started `cmd\git.exe` and killed it found the `git.exe` it had started
gone too (Git 2.56.0.windows.4).

**The memory a cancel keeps.** To put back what an open replaced, the utility process keeps that state beside
the new one until the next open: one state, never more, because an open forgets what the state it replaces had
replaced. A repository opened over one loaded to many commits therefore holds that one's rows until the next open.
This was not measured.

## A failure

A failed open takes the notice away and shows the failure as before: the failure is drawn in the task that ends
the open, and the notice goes in the same task. Measured end to end for a folder that is not a repository; git
missing and a failed read take the same path through `open` of `src/ui/renderer.ts`.

## Where the time of an open goes

**Method.** The built application was launched by a script through Playwright, on a profile of its own, with
`GIT_TRACE2_EVENT` set, so that every git process wrote its own start and exit times. The folder dialog was
answered at once in the main process. In the page a `MutationObserver` marked when the notice appeared (the
folder chosen), when it went (the reply drawn, in the task that draws it) and two animation frames later (the
rows painted). Six opens of the same folder, 1.5 s apart, in one window; the first open in a window also starts
the utility process and finds git. The load was sampled every 2 s from `Win32_Process` throughout, and is given
as the processor share of everything except the measuring script's own process tree and the sampler.

**Machine.** 8 logical processors, Windows 11, Git 2.56.0.windows.4. Not free by `AGENTS.md` §11: the other
load was 54 to 95 % in every interval, most of it the WSL virtual machine (about two processors) and the
antivirus. The absolute figures are this machine's under that load; the shares are what the findings rest on.

**Repositories.** The 50 000-commit repository the memory budget opens, built by the committed generator from
the same recipe (`test/fixtures/specification.json`, shape `large`) into a folder of its own; it has no
commit-graph file. And a clone of `github.com/torvalds/linux` made for this measurement with
`--filter=blob:none` into a temporary folder, removed afterwards: 1 507 902 commits, 97 372 files in the
working tree, 954 tags, and the commit-graph file the clone wrote.

**Readings**, in milliseconds, with discovery finding `cmd\git.exe` as on a person's start. *Before git* runs from
the folder chosen to the first git process's start: the bridge, the main process, the utility process and
starting that process. *Between* is the four gaps between the five git processes. *After* runs from the last git
process's exit to the reply drawn: the layout, the page, and its two copies between processes.

| repository | open | chosen to painted | before git | folder check | stash list | log | references | status | between | after | painted | other load |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 50 000 | 1 | 3851 | 1193 | 91 | 104 | 866 | 87 | 90 | 1345 | 34 | 40 | 63 % |
| 50 000 | 2 | 2908 | 336 | 90 | 98 | 855 | 124 | 85 | 1275 | 18 | 28 | 63–70 % |
| 50 000 | 3 | 2711 | 236 | 70 | 73 | 882 | 111 | 108 | 1183 | 26 | 22 | 73–83 % |
| 50 000 | 4 | 4695 | 399 | 100 | 107 | 1527 | 222 | 256 | 2019 | 40 | 25 | 82–86 % |
| 50 000 | 5 | 5706 | 618 | 263 | 267 | 1420 | 182 | 122 | 2692 | 119 | 24 | 75–90 % |
| 50 000 | 6 | 3256 | 419 | 122 | 97 | 948 | 106 | 100 | 1424 | 20 | 21 | 80–92 % |
| Linux | 1 | 9192 | 1203 | 94 | 105 | 4036 | 213 | 1372 | 1995 | 79 | 96 | 73–79 % |
| Linux | 2 | 6694 | 415 | 109 | 102 | 3281 | 180 | 822 | 1660 | 83 | 42 | 54–94 % |
| Linux | 3 | 8142 | 501 | 95 | 104 | 4514 | 306 | 656 | 1898 | 32 | 36 | 69–90 % |
| Linux | 4 | 7518 | 370 | 86 | 155 | 4264 | 180 | 533 | 1874 | 27 | 29 | 59–95 % |
| Linux | 5 | 7644 | 325 | 89 | 105 | 4512 | 179 | 745 | 1636 | 29 | 25 | 59–89 % |
| Linux | 6 | 6045 | 274 | 76 | 83 | 3622 | 195 | 541 | 1203 | 24 | 27 | 56–80 % |

The same twelve opens taken first from a Git Bash environment, whose `PATH` found `ucrt64\bin\git.exe` with no
second process, read 2743 to 5087 ms (50 000) and 5577 to 10704 ms (Linux) from chosen to painted, with the log at
888 to 1818 ms and 3336 to 6734 ms, and *between* at 1154 to 1936 ms and 1035 to 1584 ms.

**Parsing** happens while git writes: the parser is handed each chunk of the log as it arrives
(`src/adapters/git-process.ts`), so its cost is inside the log's span and is not separated here. Run from the
command line with the open's revision arguments and only the object name in the format, three runs each at the
load above, the log alone took 4033 to 4617 ms on Linux and 1150 to 1361 ms on the 50 000-commit repository; the
in-application spans of the same log, 3281 to 4514 ms and 855 to 1527 ms, are no longer, so parsing adds nothing
this measurement can tell from the load's noise.

**Findings, raised and not repaired** (each is outside this slice's boundary):

- **git's log is most of a large open.** 3.3 to 4.5 s of 6.0 to 9.2 s on Linux, and 0.9 to 1.5 s of 2.7 to
  5.7 s on the 50 000-commit repository. What costs is `--date-order` (`commitLogArgs`,
  `src/adapters/git-commands.ts`): from the command line, three runs each, with only the object name in the
  format, Linux took 4033 to 4617 ms with the
  open's arguments, 536 to 549 ms without `--date-order`, and 408 to 489 ms with `--date-order` and without
  `--tags`; the 50 000-commit repository took 1150 to 1361 ms, and 281 to 304 ms without `--date-order`.
- **git is started five times, one process after another.** The gaps between the five came to 1.2 to 2.7 s, and
  0.2 to 0.6 s passed before the first started, after the first open of a window. Started the way `runGit`
  starts it, `git --version` took a median of 377 ms through `cmd\git.exe` and 282 ms through the `git.exe` it
  starts, ten runs each with the whole machine at about 88 %: the program discovery finds on a person's `PATH` adds a second
  process to every git command.
- **The rest is small.** From the last git process's exit to the reply drawn, 18 to 119 ms; from drawn to
  painted, 21 to 96 ms.

## Interfaces

- **New channel `repository:cancel-open`** (`CHANNELS.cancelOpen`), its reply `CancelOpenResponse`, a `Result` of
  `CancelledOpen` (the path of the repository open after the cancel, or `null`), and the bridge method
  `cancelOpen`, all recorded by `gates:contract`. The open request and its reply keep their shape.
- **Between the main and the utility process** (`src/app/repository-protocol.ts`, not the contract): the
  question `cancel-open`.
- **`endedBy(signal, work)`**, exported by `src/adapters/git-process.ts`.

## Tests

- `test/e2e/opening-notice.spec.ts`: the notice names the folder, its path and its live sentence, the ring
  turns, the content is inert and the Open control waits; Escape ends the wait within 3 s while the repository's
  `core.fsmonitor` hook holds `git status` for 30 s, puts back the repository shown, leaves no `git.exe` naming
  the folder 5 s after, and the late reply changes nothing, a further page included; a page held in the main
  process and handed back after Cancel is not drawn, and the repository it replaced answers the next Load More;
  an open named on the command line shows the notice, fades the ring under reduced motion, and a cancel leaves
  the empty window; a failed open takes the notice away and shows the failure.
- `test/e2e/open-repository.spec.ts`: the notice is gone and the graph usable once the first page is drawn.
- `src/adapters/git-process.spec.ts`: a run whose signal aborts while git writes is ended short of its output and
  answers a cancellation; a run inside work whose signal has aborted starts nothing; a run outside the work is
  left alone.
