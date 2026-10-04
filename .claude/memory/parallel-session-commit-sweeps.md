---
name: parallel-session-commit-sweeps
description: A teammate session commits this repo with add-all sweeps — your in-progress files can land under their unrelated commit messages; commit early
metadata: 
  node_type: memory
  type: project
  originSessionId: 1f3a74c5-33fb-4f55-98e4-13a351cbc3b4
  modified: 2026-10-03T14:06:50.326Z
---

Observed 2026-10-03: while I was mid-task, a parallel session in this
repo made commits (b34a538..2ce0017, runbook-themed) that swept my
in-progress suitability/datasets files into them via an add-all commit.
Nothing was lost — the working tree is shared — but authorship and
feature grouping get muddled.

**Why:** AGENTS.md notes "another teammate works in this repo"; their
sessions commit the whole working tree, not just their files.

**How to apply:** when working here, commit each completed unit of work
promptly (AGENTS.md already mandates commit+push when done — bias
earlier, not later), and check `git log -- <file>` before assuming a
file you created is uncommitted. Related: [[shared-repo-memory]].
