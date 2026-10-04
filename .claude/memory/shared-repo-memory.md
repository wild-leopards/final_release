---
name: shared-repo-memory
description: This project keeps agent memory inside the repo (.claude/memory), committed and pushed; machines need a local override
metadata:
  type: project
---

Agent memory for this project is stored in the repository at
`.claude/memory/` (this directory) and committed & pushed, so every
teammate's agent sessions share context.

**Why:** The default Claude Code memory location is a per-user directory
outside the repo; the team chose shared, versioned memory instead.

**How to apply:** Memory files must exist here to be shared. If memories
seem to disappear between machines, check that the
`autoMemoryDirectory` override in `.claude/settings.local.json` points to
this repo's `.claude/memory` (see CLAUDE.md). Workflow and project facts
live in [[AGENTS.md]] at the repo root and in `docs/` — don't duplicate
them here; save only what those files don't already record.
