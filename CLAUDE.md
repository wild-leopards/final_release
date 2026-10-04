# CLAUDE.md

Read [AGENTS.md](AGENTS.md) first — it is the canonical, cross-tool
instruction file for this repository (project overview, commands, workflow
rules, question policy, styling rules). Everything there applies to
Claude Code as well.

## Claude Code–specific notes

### Memory location (per-machine setup required)

Agent memory for this project is stored **inside the repo** at
`.claude/memory/` and committed/pushed like normal files, so the whole
team shares the same accumulated context.

By default Claude Code saves project memory in a per-user directory
outside the repo. Each developer machine needs a one-time override in
`.claude/settings.local.json` (this file is git-ignored, so everyone sets
it up themselves):

```json
{
  "autoMemoryDirectory": "~/Projects/Hackaton/Project/.claude/memory"
}
```

Adjust the path to wherever the repo is cloned on that machine. If this
override is missing, memories will silently go to the default location
and won't be shared — check for it when setting up a new machine.

### Git

- End commit messages with:
  `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- Commit and push when work is complete (see workflow rules in AGENTS.md).
