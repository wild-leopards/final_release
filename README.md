# Energy Around Us

Hackathon project: an interactive 3D Earth dashboard where users place
simulated energy infrastructure (data centers, factories, …) on the globe
and compare each region's estimated environmental state before and after
placement — with a Java backend fetching real satellite/environmental data
from NASA's POWER API.

The repository has two main parts:

| Part | What it is | Docs |
|---|---|---|
| **Frontend** (`src/`) | React + TypeScript + Three.js (React Three Fiber) monitoring-console UI with an interactive textured Earth | [docs/frontend/frontend.md](docs/frontend/frontend.md) |
| **Backend** (`src/main/java/`, `pom.xml`) | Java 17 + Maven HTTP service integrating the NASA POWER API (solar radiation, meteorology) | [docs/backend/deployment.md](docs/backend/deployment.md) |

Deployment target: the team minipc — see [docs/ops/minipc.md](docs/ops/minipc.md).

## Quick Start

### Frontend (pnpm)

```bash
pnpm install
pnpm dev        # dev server
pnpm build      # type-check + production build -> dist/
pnpm lint       # oxlint
```

### Backend (Java 17 + Maven)

```bash
mvn clean package
java -jar target/project-0.0.1-SNAPSHOT-jar-with-dependencies.jar
# HTTP API on :8080 — endpoints in docs/backend/deployment.md
```

## Documentation Index

```text
docs/
├── frontend/
│   ├── frontend.md                 # frontend architecture, features, styling rules
│   ├── projection.md               # timeline projection model + AI insights design
│   ├── suitability.md              # site-suitability verdicts (backend fixes, Ember/Aqueduct)
│   ├── formulas.md                 # every timeline formula + where it lives in code
│   └── verification.md             # per-feature verify matrix + headless-Chrome E2E recipe
├── backend/
│   ├── satellite-api.md            # NASA POWER API reference (parameters, formats, limits)
│   ├── usage-examples.md           # practical Java usage examples
│   ├── deployment.md               # HTTP API reference + minipc deployment flow
│   └── git-installation.md         # installing/configuring Git (Windows-focused)
├── ops/minipc.md                   # backend deployment machine specs & notes
│   └── ops/tile-build-pc.md        # fast Balkans tile build on a gaming PC
├── CREDITS.md                      # citations for model constants + dataset licenses
├── research/formula-research1.md   # researched constants review (raw, with citations)
└── handoff-prediction.md           # session handoff log (WP1 built 2026-10-03)
```

Feature-level what/how/where-computed/data-source/verify coverage:
[docs/frontend/verification.md](docs/frontend/verification.md).
Agent instructions for AI coding tools live in [AGENTS.md](AGENTS.md)
(Claude Code also reads [CLAUDE.md](CLAUDE.md)).

## Environment Variables

None required — defaults target the team minipc. Street View imagery uses
the [Mapillary](https://www.mapillary.com/developer/api-documentation/) API;
add a free token in `.env.local` to enable the STREET VIEW card in the
regional inspector:

```bash
VITE_MAPILLARY_TOKEN=...                        # Mapillary client access token
VITE_POWER_API_BASE=http://172.20.10.2:8080   # NASA POWER backend
VITE_TILES_BASE=http://172.20.10.2:8081       # OpenStreetMap tile server
```
