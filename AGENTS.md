# AGENTS.md — Agent Instructions

Shared instructions for AI coding agents (Claude Code, Codex, Cursor, …).
Claude Code: also see `CLAUDE.md` for tool-specific notes.

## Project Overview

"Energy Around Us" — a hackathon project with two parts in this one repo:

1. **Frontend** (`src/`): React + TypeScript + Vite + Three.js
   (React Three Fiber / Drei) dashboard with an interactive textured 3D
   Earth. Users place simulated infrastructure and see before/after
   environmental impact. Plain CSS only.
2. **Backend** (`src/main/java/com/example/`, `pom.xml`): Java 17 +
   Maven HTTP service (`PowerApiServer`) integrating the NASA POWER
   satellite API.

Detailed, up-to-date docs live in `docs/` (see the README index) — read the
relevant doc before working on an area, and keep them in sync (below).

## Commands

```bash
# Frontend
pnpm install
pnpm dev          # dev server
pnpm build        # type-check + production build (must pass)
pnpm lint         # oxlint (must pass)

# Backend
mvn clean package
mvn test
java -jar target/project-0.0.1-SNAPSHOT-jar-with-dependencies.jar
```

## Workflow Rules

- **Commit and push after completing changes** unless told otherwise or
  the task is not fully done. Direct pushes to `main` are the norm on
  this project. Note: another teammate works in this repo — pull/rebase
  if the push is rejected.
- **Update the docs** (`docs/…`) together with the change whenever
  behavior, structure, features, or workflows change, so future sessions
  start with up-to-date context.
- **Verify before finishing**: `pnpm lint` and `pnpm build` must pass for
  frontend changes; run the built app when the change is visual.
- Prefer small, readable, hackathon-friendly code: React function
  components, no premature abstraction, no class hierarchies, no
  placeholder architecture for features that don't exist yet.
- TypeScript: no `any` unless truly unavoidable; never silence errors
  with unsafe casts or disabled checks.

## Asking Questions

- Questions are welcome — in bulk and early (usually during planning),
  not dribbled one at a time.
- **Always ask before installing new dependencies.**
- Small, low-stakes decisions: just pick a sensible default and mention it.
- Design/layout questions and anything needed for a better decision:
  ask.

## Styling Rules (Frontend)

- Plain CSS files in `src/styles/`; all design tokens are CSS variables
  in `global.css`. Do not scatter colors/fonts through components.
- Prefer CSS classes over inline styles (exception: dynamic values from
  data, e.g. per-kind accent colors).
- Keep CSS files from growing unboundedly — split by area when needed.
- **No Tailwind** unless it provides a clear animation/preset advantage.
- Preserve the established design: dark control-room console, thin cyan
  outlines, restrained glow, blue-highlighted central globe viewport,
  purple timeline. Must stay readable with all glow removed.
  Transitions 100–250 ms.

## Domain Notes

- All environmental numbers in `src/lib/simulation.ts` are **synthetic
  deterministic heuristics**, not real data. The model is structured so
  real datasets (NASA POWER via the backend, grid carbon intensity, …)
  can replace the heuristic functions without UI changes.
- Terrain accuracy is explicitly out of scope — Earth stays one textured
  sphere (no Cesium, no elevation meshes).
- The NASA POWER API needs no API key.

## Memory (agent memory location)

Agent memories are stored **in this repository** at `.claude/memory/` and
committed/pushed like code, so every teammate's agent shares context.
This requires a per-machine setting — see `CLAUDE.md` for how to configure
it (Claude Code) or set the equivalent for your tool.

## Deployment Context

The backend runs on the team minipc ("dminipc") — specs and setup notes in
`docs/ops/minipc.md`. Deployment is rsync + rebuild on the minipc; see
`docs/backend/deployment.md` (`deploy.sh` / `deploy.bat` are legacy
one-time git-init helpers, not the deploy path).
