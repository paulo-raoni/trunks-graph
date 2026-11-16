# E07 · Packaging and distribution

What a person downloads: the application built for their system, under its own name and icon, installed or run
from a single file, and reachable from the file manager.

## Goal

Someone who has never cloned this repository installs Trunks Graph on Windows with one file, starts it from the
Start menu or from a folder's context menu, and sees the version they installed. Later, the same on macOS and
Linux.

## In scope

The behaviour inventory of E07 in `docs/PLAN.md` §2: the Windows build with its installer, its portable build and
the folder context menu (M01), and the other platforms (M02). M01 also carries the project's new name into the
application itself, since the name the installer shows is the name the application must use.

## Out of scope

- Publishing a release on the hosted repository and signing the executables: both are the owner's steps, and
  signing costs money (`AGENTS.md` §2, `docs/PLAN.md` §7).
- Automatic updates.
- The web build of the graph (issue #20), which is an epic of its own once the owner approves it.

## Milestones

| ID | title | state |
| --- | --- | --- |
| E07-M01 | Windows build | in flight |
| E07-M02 | Other platforms | planned |

Outcomes are in `docs/PLAN.md` §2. The epic was in the plan approved on 2026-09-11. On 2026-11-16 the owner moved
E07-M01 ahead of the order `docs/PLAN.md` §5 proposes and approved starting it ("pode dar push no dev e começar o
E07-M01"). The reason is that the project is going public under the name Trunks Graph, and it should not go public
without an installer.
