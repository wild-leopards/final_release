# Verification — how to check every feature

Per-feature verification matrix (the "how to verify" the docs overhaul
asks for) plus the headless-Chrome E2E recipe. `pnpm lint` and
`pnpm build` must pass before anything is committed; everything visual
below runs against the built app (`pnpm preview`) after `pnpm build`.

## Headless-Chrome E2E (no installs — team Macs)

Full recipe lives in the team memory
[`.claude/memory/mac-e2e-headless-chrome.md`](../../.claude/memory/mac-e2e-headless-chrome.md)
(kept in-repo by convention). Short form:

1. `pnpm build && pnpm preview --port 4173`
2. Launch installed Chrome:
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --headless=new --remote-debugging-port=9333 \
     --use-angle=swiftshader --enable-unsafe-swiftshader \
     --no-first-run --no-default-browser-check --window-size=1600,1000 about:blank
   ```
   The two swiftshader flags are mandatory — without WebGL2 the app
   boot-crashes (`GPUInitializationError`, empty `#root`).
3. Drive from Node ≥ 22 (built-in `WebSocket`) over raw CDP:
   `fetch http://127.0.0.1:9333/json/list` → page target's
   `webSocketDebuggerUrl` → `Page.navigate` / `Runtime.evaluate` /
   `Input.dispatchMouseEvent` (real clicks for the globe canvas and the
   timeline) / `Page.captureScreenshot`.
   - **Launch Chrome with an isolated `--user-data-dir`** (e.g. a temp
     folder) — a headless instance sharing the running desktop Chrome's
     profile produces one-session flakes (missed boot mounts, dead CDP
     input). Park the page on `about:blank` when a suite ends.
   - Swiftshader re-rasterizes a full-screen fading/masked street layer
     per rAF — keep DOM style writes change-guarded (StreetLevel does)
     or the GPU helper process eats multiple cores.
4. Flow: click anywhere to skip the intro → click
   `.globe-action-button` → pick an `.object-menu__option` → click the
   canvas center to place → drive panels. Note: Vite
   preview binds `[::1]` here — navigate to `http://localhost:4173/`,
   not `127.0.0.1` (ERR_CONNECTION_REFUSED otherwise).

## Per-feature matrix

| Feature | How to verify | Where it's defined / computed | Data source |
|---|---|---|---|
| Globe render + WebGL flags | app renders (no empty `#root`); screenshot differs from blank | `Globe.tsx`, R3F canvas | NASA textures (`src/assets/textures/earth/CREDITS.md`) |
| Intro boot sequence | real click skips; dashboard rises in | `IntroOverlay.tsx` + `Globe.tsx` camera rigs | MapLibre basemap (`docs/ops/minipc.md`) |
| Object type picker + placement | `.globe-action-button` → `.object-menu__option` → canvas click → marker appears, inspector opens | `AddObjectControl.tsx`, `GlobeViewport.tsx`, `App.handleSurfaceClick` | — |
| Marker kinds + custom facilities | custom form (name/capacity/accent) creates `custom-…` kind | `MARKER_KINDS`, `AddObjectControl.submitCustom`, `simulation.ts` | user-defined |
| Marker interaction (popup/labels/altitude shrink) | click marker: popup with Relocate/Remove; labels fade by zoom | `Markers.tsx` (markerScaleForAltitude lives here) | — |
| Rotation speed curve (2026-10-04) | drag in orbit spins at ≤0.45× of the three default (cursor-speed-faithful); street drag pans ~1:1 horizontally at any latitude (cosφ-compensated, clamped at 0.35 near the poles — no "spins like crazy"); monotone between; polar clamp padded 3° off the pole | `rotateSpeedForAltitude` + `IdleSpin` call site (`Globe.tsx`) | — |
| Wheel zoom depth (2026-10-04) | wheel from orbit reaches street zoom stepwise (0.4 map-zoom/notch — `AltitudeZoom` intercepts wheels capture-phase); deep min ≈ map-zoom 16–17 is reachable ("further zooming in") | `Globe.tsx` `AltitudeZoom` | — |
| Street map render-distance peel (2026-10-04) | zooming out: map stays solid well below the descent threshold, then edges unrender first (radial mask — chunk-unload feel) before globe returns | `StreetLevel.tsx` (`FADE_ZOOM_*`, `applyStreetMask`) | — |
| Street facility interactions (2026-10-04) | street-place a marker (pixel-exact), click its dot → select; re-click → popup opens (`pointer-events: auto`); real click on − Remove removes it (E2E: e2e-street-popup.mjs flow) | `StreetLevel.tsx` street input layer + `panels.css` | — |
| Idle-spin drift control (2026-10-04) | camera never auto-drifts while a marker is selected/popup open/placing; spin resumes 4 s after the last DRAG or wheel (bare pointermove/hover must NOT count — it killed the spin once) | `Globe.tsx` `IdleSpin` (`hold`, `IDLE_RESUME_MS`) | — |
| Analytic placement hit (2026-10-04) | click site = ray ∩ unit sphere (NOT the faceted mesh — ~12 km sag would smear street-zoom landing by thousands of px) | `raySphereHit` (`src/lib/geo.ts`) | — |
| Placement on insecure origins (2026-10-04) | open the app via plain-HTTP LAN URL (`vite --host`), place a marker → works (crypto.randomUUID is missing there; `randomId` falls back) | `src/lib/id.ts` | — |
| Intro map fast-hide (2026-10-04) | at the pull-back the intro's OSM map hides in 0.45 s — never lingers under the rising dashboard | `IntroOverlay.tsx` + `intro.css` (`intro-overlay__map--hidden`) | — |
| Intro street-map toggle (merge) | `INTRO_STREET_MAP = false` → same choreography, no start map | `IntroOverlay.tsx` const | — |
| Relocation (preserves scenario) | select marker → Relocate → new site: name/operations kept, baseline re-resolved | `App.handleSurfaceClick` (relocating branch) | — |
| Impact estimate at placement | inspector rows = formulas.md §3 with `IT = nameplate` | `simulation.estimateImpact` | Ember/Aqueduct (bundled) + POWER (live) |
| Live enrichment TRACE → POWER | placement triggers sequential fetches; failure keeps heuristic numbers (badge stays HEURISTIC) | `App.enrich`, `simulation.enrichMarkerWith*` | Climate TRACE v7 + NASA POWER |
| Enrichment never clobbers a user edit | change scenario within ~2 s of placing: the edit survives when enrichment lands | `App.enrich` merge | — |
| Grid intensity + slope (real) | inspector grid card shows Ember g + "(Ember <year>)" | `datasets.ts loadEmber/emberSlopePctPerYear` | Ember Yearly Electricity Data, CC-BY 4.0 |
| Water stress (real) | Aqueduct label in water verdict + inspector | `waterStressByIso3` | WRI Aqueduct, CC-BY 4.0 |
| Timeline scrub/playback | drag `.timeline-track` or skip-to-end button; year label advances | `SimulationTimeline.tsx`, `App` playback tick | — |
| Projection model (baseline) | grid compounds along slope, warming +0.03 °C/yr, CO₂ trend clamped | `projection.projectBaseline` | formulas.md §1–2 |
| Facility projection | energy/CO₂/water re-derived per year; PUE drifts; not-built years all-zero | `projection.projectImpact` | formulas.md §3 |
| **Demand scenarios (2026-10-03)** | place AI DC: default "growth +25 %/yr" in OPERATIONS card → pick viral → at 2050: "Operational · at capacity (×3)", HUD "Active IT Load 240MW ×3.0 nameplate from demand growth"; steady → ×1 (flat); decline → ×0.1; viral energy delta = 3× steady delta | `simulation.defaultOperationsForKind/OPERATIONS_SCENARIOS`, `projection.demandFactor/rampStatus`, inspector `OperationsCard`, `GlobalHud` | IEA Energy & AI 2025/2026, Cambridge CCAF 2025 (docs/CREDITS.md) |
| Suitability assessment | SITE ASSESSMENT card score + verdicts, re-projected with the scrub year | `suitability.siteSuitability` | NASA POWER + Ember + Aqueduct (suitability.md) |
| Placement outlook line | one-liner under ghost label on ≥2° moves | `suitability.outlookSummary` | Ember + Aqueduct + latitude band |
| Biggest-threats layer | toggle + select dot → inspector shows real facility profile | `ThreatDots.tsx`, `App.selectedThreat` | Climate TRACE top 60 |
| Data overlay layers (merge) | LAYERS button in the viewport title bar → check/uncheck Grid carbon intensity (Ember) and Water stress (Aqueduct); gradient fills repainted on the globe; count chip on the button | `DataOverlays.tsx`, `GlobeViewport.tsx` | Ember 2024 + WRI Aqueduct |
| Data-centers layer | toggle shows OSM DCs; click → DATA CENTER PROFILE with projected grid/PUE | `DataCenterDots.tsx`, `osm/dataCenters.ts`, inspector `DataCenterProfile` | OSM tags (PMTiles/Overpass bundle) + Ember slope |

**Known open item (2026-10-04, sole leftover of the street-view pass):**
a marker placed in orbit view carries ~0.1° (~11 km) of latitude offset
relative to the camera's sub-point by the time the street map engages —
at building-level zoom the dot can sit off-screen until panned. The
street map mirrors the camera exactly (verified: `mapCenter` == camera
sub-point to 2 decimals) and street-placed facilities are pixel-exact;
the residue comes from the camera pose at placement time (suspects: the
intro skip/pull-out animation not settling at exactly the home pose +
the pre-fix idle-spin drift; the drift fix + analytic hit landed in the
same pass but a small lag remains). Next step: settle the intro's final
camera pose exactly / re-anchor the camera to the placed site on
descent, then re-run the popup/remove assertion (it's marked SKIP in the
E2E runner until then).
| Co-location warning | place within 40 km of a DC/own facility → ⚠ note | inspector (needs all `markers` — pass from `App`) | `osm/dataCenters.ts` |
| Street-level zoom | descend in Europe → map crossfade, graticule fallback off-tiles | `StreetLevel.tsx` (internals in frontend.md) | own PMTiles archive (ODbL) |
| City search + fly-to | search, Enter → camera arcs to city; European cities continue to street level | `CitySearchBar.tsx`, `Globe.CameraFlyTo` | `src/lib/cities.ts` |

## Backend (deployed on the minipc)

- Unit: `mvn test`, package: `mvn clean package` — see
  `docs/backend/deployment.md` for endpoints and the deploy flow.
- NASA POWER parameter sanity clamps live server-side (values in
  suitability.md "Backend fixes"); verify with the Sofia/Phoenix
  spot-checks listed in suitability.md.
