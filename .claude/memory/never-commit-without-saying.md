---
name: never-commit-without-saying
description: "User demands NO git commits/pushes until they explicitly say so, despite AGENTS.md's commit-after-workflow rule"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ac0f7226-5f8a-4401-804a-3e2786e791b5
  modified: 2026-10-03T12:50:01.035Z
---

Do NOT commit or push unless the user explicitly asks for it in that session. This overrides the AGENTS.md "commit and push after completing changes" workflow rule for this user.

**Why:** The user shouted "DO NOT COMMIT UNTIL I SAY SO!!!!!!!" (2026-10-03) — they want full control over what lands in the shared repo history and when.

**How to apply:** Finish work, verify (lint/build/E2E), summarize changes, and offer a suggested commit message — but never run `git commit`/`git push`. Also note git is not on PATH on this Windows machine anyway; see [[win-machine-no-git]].
