---
name: win-machine-no-git
description: Git for Windows installed 2026-10-03 (was missing before); browser E2E works via headless Edge + playwright-core in tmp/e2e
metadata:
  node_type: memory
  type: project
  originSessionId: a95aa960-09cb-4af2-946a-7bc8431d1150
  modified: 2026-10-03T12:56:23.617Z
---

**Update (2026-10-03, later):** Git for Windows 2.55 is now installed and on PATH (`C:\Program Files\Git\mingw64\bin\git.exe`) — git operations work from this machine. The user still wants to run commits personally — see [[never-commit-without-saying]].

Original note: the machine previously had **no git client** on PATH at all (checked 2026-10-03 earlier the same day); the repo was cloned elsewhere.

**Why:** Avoids re-searching for git.exe every session and explains why the "commit and push" workflow rule can't be completed by the agent here.

**How to apply:** After finishing work, hand the user the exact `git add/commit/push` commands instead of trying to run them. Also: `.gitignore` contains committed merge-conflict markers (`<<<<<<< Updated upstream` / `>>>>>>> Stashed changes`) — both halves' rules still apply, including `tmp/` being ignored.

For browser verification on this machine: no chromium-cli/playwright; use headless Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`) driven by playwright-core installed inside the git-ignored `tmp/e2e/` folder (own package.json — never a project dependency). See [[shared-repo-memory]].
