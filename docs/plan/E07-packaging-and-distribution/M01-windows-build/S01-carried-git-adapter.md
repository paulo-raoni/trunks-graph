# E07-M01-S01 · Carried: the git adapter

**Parent:** E07 Packaging and distribution > E07-M01 Windows build > E07-M01-S01 carried: the git adapter

Five findings that E04-M01's review rounds classed as carried, in the code that reads a repository through git.
Two are defects a person can meet (a branch made on a stash's own commit, and a log left waiting on its standard
input). Two are about the adapter's suites. The fifth, a measurement of the details read on older git versions, is
not done in this lane; the last section says why. None of this is behaviour of Git Graph.

## C-26, a branch made on a stash's own commit

`git stash` records a stash as a commit whose second parent is a commit of the index and, with
`--include-untracked`, whose third is a commit of the untracked files. After `git branch kept stash@{0}` the log
reaches the stash through the branch and walks all of its parents. `interleaveStashes`
(`src/core/parse/stash-list.ts`) already made the stash one row and dropped the log's copy of it, but the index
commit and the untracked-files commit arrived as ordinary rows.

- **Reproduced on the base** (2026-11-16, git 2.56.0.windows.4, Windows, Node 24.18.0): the new cases of
  `src/adapters/git-stash-branch.spec.ts` build two repositories with fixed dates, one with a plain stash and one
  with `--include-untracked`, each with a branch `kept` on `stash@{0}`, and read a page under every branch and
  under the selection `refs/heads/kept`. All four failed at the assertion that no internal commit is a row.
- **The repair.** When the log's copy of a stash arrives, its second and later parents are remembered, and each is
  dropped when it arrives, which is after its child in the log's order. The stash's own row, its place and its
  first parent are unchanged. The cases in `src/core/parse/stash-branch.test.ts` hold this for each parent, for
  both ways the log is ordered, and hold that a commit of the same name is kept when no stash is the log's copy.
- **The page was short.** The log is asked for `pageSize + 1` commits, and the dropped ones used up places: with a
  page size of 2 the page held one row and said there was no more. `readCommits` of `src/adapters/git-page.ts` now
  asks for two commits more per stash. The cases read a page of 2 and expect two rows and `hasMore`; with the
  allowance set to 0 four of them failed, with 2 they pass.
- **Not done:** the application was not opened on such a repository and looked at. What was compared is the page
  the reader reads, as rows by object name, in the cases above.

## C-36, `--stdin` with no names

`commitLogArgs(…, true)` under a selection gives the log `--stdin` whether or not any name is written, and
`runGit` closed git's standard input only when it had text to write. The reader never reaches the case, because a
selection that reads no name runs no log; a caller that did would have had git wait for ever.

`runGit` now closes standard input in every case. The alternative, leaving `--stdin` out when no name is written,
would leave the log with no revision at all, and a log given none walks HEAD (`selectsAnyRevision`), which is the
wrong page. Closing the input is one line in the one place every run passes through, and it ends a `--stdin` that
is ever given by mistake. `src/adapters/git-stdin-closed.spec.ts` runs that log with no input and fails if it is
still running after 30 s. On the base it was still running at 30 s (31.8 s case time); with the change it ends.

## C-42, the closed list of `git-colour.spec.ts`

`topLevelArguments` builds the argument list `git rev-parse --show-toplevel` runs, so it belongs in the list; it
had escaped because the suite found the adapter's lists by a name ending in `Args`. The suite now holds every
export of `src/adapters/git-commands.ts` to be a list unless it is named in `NOT_ARGUMENT_LISTS`, and
`topLevelArguments` is in the list of lists. Probe: an exported `probeLister` function, appended to the module,
failed the case "names every exported argument list"; it was removed and the case passed.

## C-47, the setup of `git-selection-many.spec.ts`

The setup of 1 000 branches is now one `fast-import` of the commits onto `main`, with the marks exported, and a
`packed-refs` file written from them, in place of a `fast-import` that writes a loose reference file for each
branch. Measured by this lane on this machine with the setup's own steps, three runs each: before, `git init`
0.26 to 0.35 s and `fast-import` 5.8 to 6.4 s, 6.1 to 6.7 s in all; after, 0.64 to 0.89 s in all. The whole spec
file took 12.5 to 15.0 s before (three runs) and 5.8 to 8.4 s after (three runs). Both were taken with other
processes running, not in a window measured free, so they bound nothing under load. The 120 s limit is
unchanged: it moves only on a measurement under load, and none was taken. `git fsck` on the repository built the
new way printed nothing, and `for-each-ref` listed its 1 001 references.

## C-23, the details read on git 2.31 to 2.50 (not done)

The task has this lane run the details suite on at least git 2.31 and 2.50, from official MinGit or PortableGit
archives. Downloading them needs the owner's explicit permission in the session, which this lane did not have, so
no archive was fetched and no version other than 2.56.0.windows.4 was run. The finding stays open.
