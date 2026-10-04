# Frontend — Interactive 3D Earth Dashboard

The frontend is a futuristic monitoring console: a textured, interactive 3D
Earth surrounded by HUD panels. Users place simulated infrastructure on the
globe and compare the region's estimated environmental state before and
after placement.

## Stack

- Vite + React + TypeScript (pnpm)
- Three.js via @react-three/fiber and @react-three/drei
- MapLibre GL for the city-detail street map and intro map (own OSM tiles)
- GSAP for the intro/dashboard reveal animations
- Plain CSS (no Tailwind, no CSS modules) — see “Styling” below
- oxlint for linting (Vite template default; `pnpm lint`)

## Commands

```bash
pnpm install
pnpm dev        # dev server
pnpm build      # type-check + production build
pnpm preview    # serve the production build
pnpm lint       # oxlint
```

## Current Features

Per-feature what/how/where-computed/data-source/verify coverage lives in
the matrix in [docs/frontend/verification.md](verification.md) — style
template: [docs/frontend/formulas.md](formulas.md). The feature list
below stays the narrative overview:

- **Textured Earth** — NASA Blue Marble day map, night-lights emissive map,
  topology bump map, thin atmosphere halo. Still a single lightweight
  sphere; no terrain geometry (out of scope by design).
  Sources/license: `src/assets/textures/earth/CREDITS.md`.
- **Starfield** — `Starfield` in `Globe.tsx`: an inverted sky sphere
  (radius 80, inside the camera's far plane) carrying a procedurally
  drawn equirectangular star texture (seeded, identical every reload).
  Mesh-based on purpose: GL point sprites (drei `Stars`/`PointsMaterial`)
  proved invisible on some rasterizers, a textured sphere renders
  everywhere. Fades out with the scene on street-level descent.
- **Object placement** — the action button in the globe viewport opens a
  type picker; picking a type enters placement mode (crosshair cursor,
  ghost preview follows the surface), then a click on the globe places the
  object. ESC cancels.
- **Object types** — presets in `src/lib/simulation.ts`
  (`MARKER_KINDS`): Data Center, AI Data Center, Factory, Crypto Mining
  Farm — each with its own capacity/PUE bias/accent color and a
  default demand scenario (`defaultOperationsForKind`). User-defined
  custom kinds get `custom-…` ids (start steady).
- **Operations / demand scenarios** (since 2026-10-03) — every placed
  facility carries an operations profile (steady / growth / viral
  / decline): how its load compounds after the construction ramp,
  capped at ×3 nameplate (`demandFactor` in `projection.ts`). Editable
  per facility in the inspector's OPERATIONS card; kind defaults are
  researched (AI +25 %/yr, crypto +17 %/yr — `docs/CREDITS.md`);
  visible in the inspector lifecycle line and the HUD's "Active IT
  Load" note. Formulas: formulas.md §4; walkthrough:
  verification.md.
- **Marker interaction** — markers are selectable 3D objects (head, spike,
  pulsing ring). Labels appear when zoomed in; the selected marker shows a
  popup anchored on the globe with actions (relocate, remove). Markers
  shrink with camera altitude (`markerScaleForAltitude` in `Markers.tsx`,
  shared by the ghost preview) so they don't dwarf the street map at the
  bottom of the zoom; the ghost preview keeps the same size.
- **Biggest-threat layer** — `ThreatDots.tsx`: the world's largest real
  emitters (Climate TRACE top 60) as colored dots at their real
  coordinates (color = sector, size = emissions, log scale). Hovering
  names a facility; clicking selects it — no on-globe popup, the
  profile (name, CO₂e/yr, sector, country) shows in the inspector
  instead. The selection lives in `App` state (`selectedThreat`);
  globe clicks clear it, sidebar clicks don't; marker and threat
  selections are mutually exclusive.
- **Data overlay layers** — the LAYERS button in the viewport title bar
  (`GlobeViewport.tsx`) toggles painted country overlays from
  `DataOverlays.tsx`: **grid carbon intensity** (Ember 2024, gCO₂e/kWh,
  on by default) and **water stress** (WRI Aqueduct baseline categories),
  drawn as per-country gradient fills with a soft edge on the globe
  (2026-10-04 teammate work; it supersedes the earlier decorative dot
  overlays). The count of active layers shows on the button; the menu
  closes on outside click or ESC.
- **Environmental impact model** — `src/lib/simulation.ts` computes a
  deterministic *heuristic* baseline per site (climate zone from latitude,
  pseudo-random grid mix / AQI / water stress) and a footprint estimate
  (CO₂, energy, cooling water, waste heat). Real datasets are layered on
  top at placement time and the UI badges which numbers are live:
  - **Climate TRACE** (country CO₂e totals, rank, top facilities) via
    `src/lib/climatetrace/api.ts`;
  - **NASA POWER** (30-day satellite solar irradiation + real 2 m mean
    temperature — the real temperature feeds the PUE/cooling estimates)
    via our own backend, `src/lib/power/api.ts`.
  Both enrichments degrade gracefully: on failure the heuristic numbers
  stay.
- **Seamless orbit → street zoom** — zooming in is one continuous
  motion: the globe camera descends past map-zoom ~8 and the MapLibre
  street map (`StreetLevel.tsx`) cross-fades in with meters-per-pixel
  matched to the camera altitude, fully solid from map-zoom 9.6. The
  fade band is [8.25, 9.6] in both directions, and the map is masked
  with a radial "render-distance" gradient while partially faded: its
  edges unrender first (like distant Minecraft chunks) — on the way
  out the map holds fully opaque well past the descent threshold
  (`FADE_ZOOM_END`), then peels edge-first before the globe re-takes
  over (~1.35 z-units of extra zoom-out vs the old behavior). The
  crossfade/mask are change-guarded per frame (no style writes on
  unchanged frames — they would re-rasterize the full-screen layer
  every rAF, which burned a whole CPU core in software-GL testing).
  The map itself is non-interactive — the orbit controls stay the
  single input surface; the map mirrors the camera every frame (center
  = surface point below it). Facility interaction at street level is
  provided by StreetLevel itself (see the interactions bullet below).
  Picking a city prewarms the destination's street-level tiles while
  the fly-to runs, so the handoff is tile-complete. The street-level
  descent only happens for European cities (`isEuropeanCity` in
  `src/lib/cities.ts` — the countries the PMTiles archive covers):
  other cities fly to a close orbit instead, above the crossfade band
  (`FlyTarget.street` flag, `FLY_ORBIT_DISTANCE` in `Globe.tsx`). Real
  OpenStreetMap vector tiles come from the team's own PMTiles archive
  on the minipc (no third-party provider); wherever tiles are
  unavailable (outside Europe, or while the archive builds) a
  graticule "placeholder chart" shows — its line spacing adapts to the
  map zoom so lines always cross the viewport — and a status chip
  reports which mode is active.
- **Street-level facility interactions** (2026-10-04) — once the map
  owns the view (`cameraTelemetry.streetFade ≥ STREET_FADE_ACTIVE`,
  written per frame by the StreetLevel loop), the invisible-but-
  raycastable 3D scene yields: markers/threat/DC-dot clicks are gated
  (`Earth.tsx`, `Markers.tsx`, `Globe.tsx`) and StreetLevel routes the
  canvas clicks itself through MapLibre space: `queryRenderedFeatures`
  hit-tests the facility dots (user marker → select/re-open the
  popup; bundled DC → its DATA CENTER PROFILE, same handlers/buttons
  as globe mode), a toolbar-style popup (`.street-popup`, reusing
  `.marker-popup` styles) is anchored to the user marker with
  Relocate/Remove or Cancel-Move — with `pointer-events: auto` set
  explicitly, since `pointer-events` inherits and `.street-level`
  makes the layer click-transparent for orbit/pan (without it the
  popup renders but its buttons go dead); placing/relocating
  unprojects the click (`map.unproject`) and a DOM ghost dot follows the cursor
  (`.street-ghost`) with the same throttled outlook feed. All drags
  over 6 px remain rotate/pan gestures, never clicks (same slop as
  `Earth`'s surface clicks).
- **Placement coordinates are analytic** (2026-10-04) — the visual
  Earth mesh is a 64×64-triangle sphere whose chord planes sag up to
  ~12 km below the true surface; R3F mesh raycast hits would land
  site coordinates thousands of pixels off at street zoom. Both the
  placement click (`Earth.tsx`) and the ghost (`GhostMarker.tsx`)
  intersect the ray with the mathematical unit sphere instead
  (`raySphereHit` in `src/lib/geo3d.ts`).
- **HUD panels** — left: global totals aggregated from placed objects;
  right: regional inspector with BEFORE → AFTER comparison rows for the
  selected object; bottom: simulation timeline (see below).
- **Simulation timeline / projection** — the bottom bar is a year
  scrubber over 2026 → 2050 (drag the track, step, or press play). Every
  panel re-derives from `src/lib/projection.ts`: real Climate TRACE
  YoY trends compound forward; each country's grid projects along its
  real Ember history slope (2010–2024 regression, ln-slope clamped
  ±6 %/yr, floor/ceiling 20/1000 g, S-bend after 2040 — heuristic
  +1.5 pp/yr share growth only where Ember has no data); facilities
  ramp up over 2 years after their placement year, then follow their
  demand scenario (above) while slowly improving PUE. Markers placed
  while scrubbed to a future year exist from that year; the inspector
  shows "Not built until Y" / "Ramping up" / "Operational · demand ×N"
  states and a `PROJECTED → Y` badge. Model reference:
  `docs/frontend/projection.md` + `docs/frontend/formulas.md`.
- **Orbit controls** — drag to rotate, scroll to zoom; pan disabled so the
  globe stays centered. Both gestures are altitude-honest (2026-10-04):
  - **Drag rotation** (`rotateSpeedForAltitude` + the cosLat call site
    in `Globe.tsx`) pans 1:1 like a map at street level:
    `rotateSpeed = (tan(fov/2)/π · alt) / cosφ ≈ 0.132·alt/cosφ` — one
    pixel of drag ≈ one pixel of surface, horizontally at ANY latitude
    (azimuthal drags sweep the sub-point along a latitude circle, arc
    `R·Δθ·cosφ`, so the plain law lags ~26% at Sofia's latitude);
    vertical drags ride the same number and run a proportional hair
    fast away from the equator. The cosφ divisor is **clamped at 0.35**
    (2026-10-05): unclamped it flings the planet when dragging near the
    poles (cosφ → 0 ⇒ one pixel ×10–60 — the "spins like crazy"
    report). In orbit the spin caps at `ROTATE_SPIN_MAX = 0.45` of the
    three.js default (1.0 out-spins the cursor per PM feedback),
    reached ≥ alt 3; the curve is monotone down on descent. The
    polar clamp is padded 3° shy of each pole (`min/maxPolarAngle =
    0.05/:π−0.05`) — at exactly 0/π the azimuthal axis degenerates and
    crossing it flips the view. Both spins are planet-axis-aligned
    (world-Y azimuth + meridian pitch — the Google-Earth convention);
    the street map needs no alignment of its own, it mirrors the
    camera and stays north-up (no compass bearing is passed through —
    street drag = pan by design).
  - **Wheel zoom** (`AltitudeZoom` in `Globe.tsx`) intercepts wheel
    events one capture-phase level above the canvas (so OrbitControls
    never sees them) and dollies multiplicatively in ALTITUDE: each
    notch steps the map zoom a constant `MAPLIBRE_Z_PER_NOTCH = 0.4`
    at every altitude. This replaces OrbitControls' distance-space
    dolly, which multiplied the near-surface ALTITUDE by ~200× per
    notch (the entire street zoom range rode a couple of notches and
    the zoom limit was unreachable — "can't zoom further in").
    Deep-minimum is altitude 1.5e-4 (≈ map-zoom 16–17, building
    level; tiles over-zoom past their max fine).
  - `zoomToCursor` was dropped: pan is disabled and `IdleSpin` eases
    the orbit target home each frame anyway (zoom-to-cursor's target
    drift was ironically re-centered every frame — the effective
    behavior was center-axis zoom, which `AltitudeZoom` does directly).
  - Idle auto-spin (`IdleSpin`): the camera slowly orbits only above
    the default zoomed-out distance AND (2026-10-04) only when truly
    idle — paused while a marker is selected, a popup is open, or a
    placement/relocation is in progress (`hold`), and paused for
    `IDLE_RESUME_MS` = 4 s after the last genuine interaction.
    Interaction = drags and wheel only: a bare pointermove/hover does
    NOT reset the cooldown (the first fix counted hover moves, which
    silently killed the idle spin — the user noticed). The camera
    near-plane adapts to altitude since the surface ends up hundreds
    of meters away (floor 2e-5 for the deep street zoom).
- **Opening boot sequence** — `IntroOverlay.tsx` plays once on load
  (~6.7 s, click anywhere to skip): a splash logo (project-root
  `logo.svg`, inverted for the dark theme) shows over a fullscreen dark
  MapLibre map of Bulgaria pushing in → the logo fades and the "drone"
  pull-back starts (map zooms out and fades while the globe camera —
  starting low over Bulgaria via `IntroCameraRig` in
  `Globe.tsx` — dollies back to the home view) → the globe does a
  ~220° arrival spin alone in its frame → the dashboard chrome
  (header, panels, timeline) rises in with a GSAP stagger. When the
  overlay unmounts it commands one final `settle` spin: a slow ~140°
  camera sweep over 4 s that eases out into the idle auto-rotate, so
  the planet is still gently turning as the app goes live (skipping
  lands in the finished state with no settle spin). Any click
  skips straight to the finished state. At the pull-back the 2D map is
  hidden fast (`intro-overlay__map--hidden`, 0.45 s) so the OSM map
  never lingers as a "background" under the rising dashboard UI — the
  dashboard's own street map only re-engages when the camera descends
  again. Whether the intro opens on the Bulgaria street map at all is
  the `INTRO_STREET_MAP` const in `IntroOverlay.tsx` (merge toggle —
  flip to false to run the same choreography on the plain dark
  background without a street map on start). The intro commands the
  camera through `App` state (`introCommand`: `pull-out` / `spin` /
  `settle` / `skip`). The 2D map shares the city map's tiles and style
  (`src/lib/basemap.ts`); with the minipc tile server offline it
  degrades to the plain dark background layer. For first-paint speed
  a static twin of the overlay (`.intro-shell`) ships in `index.html`
  and is removed by the live overlay on mount — see "Boot-path
  performance round 2" above; keep the two visually in sync if the
  intro design changes.
- **Startup/perf notes** (2026-10-04) — the opening was slow to appear;
  fixes: the vendor libraries (react, three/R3F, maplibre, gsap) are
  split into parallel-downloaded cacheable chunks (`manualChunks` in
  `vite.config.ts`) instead of one ~2.4 MB bundle; `resolveTilesUrl`
  in `src/lib/basemap.ts` is memoized (one probe shared by the intro
  and street maps instead of two) with the minipc reachability timeout
  cut 4 s → 1.5 s so a dead tile server no longer stalls the whole map
  hold; the earth textures were recompressed in place (~55 % smaller
  bytes, RMSE ~1 % — visually identical at globe scale).
- **Boot-path performance round 2** (2026-10-04) — after the vendor split,
  Lighthouse still scored 60/100 desktop · 35/100 mobile (TBT 1.5 s/6.2 s
  from one ~1.5 s blocking task evaluating everything at once, and an
  FCP/LCP/SI that waited for the whole bundle on Slow-4G simulation),
  so:
  - **Pre-JS boot shell** — `index.html` now contains the intro overlay
    static (`.intro-shell`, literal mirror of the `.intro-overlay` rules
    with hex values, since the bundled CSS does not exist at first
    paint) plus `fetchpriority="high"` on its logo: first paint/LCP are
    raw-HTML paints that happen while the bundles download, instead of
    the first React commit. The live `IntroOverlay` (loaded as its own
    small chunk) covers it identically at mount and removes `#intro-shell`
    (`IntroOverlay.tsx` effect) — one authoritative copy, no flash.
  - **Lazy render stages** — `App` loads `IntroOverlay` and
    `GlobeViewport` via `React.lazy`, and `GlobeViewport` in turn lazy-loads
    `Globe` (three/R3F/drei stack) and `StreetLevel` (MapLibre). The
    entry was 680 KB transfer / one 1.5 s evaluation task; it is now
    ~123 KB gz (index + vendor-react) and the render stacks evaluate as
    separate later tasks during the intro movie. Both Suspense
    boundaries use `null` fallbacks because the static shell covers the
    stage meanwhile. Watch out: the entry must not *statically* import
    anything that imports three — that's why the sphere math moved out
    of `lib/geo.ts` into `lib/geo3d.ts` (see Source Layout), and why
    `maplibreWorker`'s `setWorkerUrl` fix is imported by BOTH intro and
    street chunks (each can be the first one to create a MapLibre map).
  - **Topology bump map → WebP** — `earth-topology.png` (grayscale, PNG)
    became `earth-topology.webp` (378 KB → 51 KB); the day/night JPEGs
    stay JPEG (re-encoding them as lossy WebP was not smaller).
  - Result (same machine, `pnpm preview`): desktop 60 → **100**, mobile
    35 → **98**; mobile FCP 4.4 → 1.8 s, LCP 5.3 → 1.8 s, Speed Index
    7.9 → 1.8 s, TBT 6,240 → 10 ms. (Those scores were flattered: the
    lazy split had silently broken the street map, see round 3.)
- **Boot-path round 3 / street-view fix** (2026-10-04):
  - **Street view regression from round 2 (fixed):** MapLibre adds
    `.maplibregl-map { position: relative }` to its container. Once
    StreetLevel became a lazy chunk, `maplibre-gl.css` was injected
    *after* `panels.css`, so it won the equal-specificity tie. The host
    `.street-level__map` lost `position: absolute; inset: 0` and
    collapsed to 0 px. As a result `zoomForCamera(…, clientHeight=0)`
    returned −∞, the crossfade never engaged, and the map canvas fell
    back to its default 300 px. It was not a double mount. Fix:
    doubled-class selectors (`.street-level__map.street-level__map`,
    same for `.intro-overlay__map`), which win whatever order the
    stylesheets load in. **Rule:** any class sitting on a MapLibre
    container that needs to override maplibre CSS needs higher
    specificity than one class.
  - **The real ~6 s first-load hang** happened in dev *and* prod.
    `DataOverlays.tsx` eagerly brute-forced two 1440×720 nearest-country
    textures (≈5.6 s of main thread) at Globe mount, even though both
    overlays start hidden. That blocked the main thread so long that even
    the local Earth textures only finished at ~9.9 s. Now each texture is
    built on the first toggle (`useShownOnce`), at half resolution
    (upscaled under the existing blur), with squared distances.
    Textures now land at ~3.0 s.
  - **Tile probe** (`resolveTilesUrl`) was *not* the hang: it settles in
    ~0.45 s on the hotspot, and only the intro map waits on it (the
    intro timeline does not). It now starts at App module load
    (parallel with the lazy chunks) and the result is cached in
    `sessionStorage` (`basemap.tilesUrl`), so reloads skip it. The
    intro also no longer creates a map if the probe resolves after
    unmount.
  - **Texture 304s:** `vite preview` serves *everything* with
    `Cache-Control: no-cache`. It runs sirv in dev mode, which hard-codes
    that in `writeHead`, and neither `preview.headers` nor a middleware
    can override it. So revalidation also happens in preview. Whatever
    statically hosts `dist/` for real should send
    `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`
    (content-hashed) and `no-cache` for `index.html`. No
    low-res texture placeholder was added: the textures load behind the
    intro, and the hang came from the CPU, not the network.
  - Lighthouse (`pnpm preview`, Lighthouse 13.4.1, this session's machine
    — note that today's numbers did not reproduce round 2's 98/100
    even before the fix): desktop 60 → **95** (TBT 4.8 s → 100 ms), mobile
    34 → **50** (TBT 10.5 s → 990 ms; LCP 6.0 s). What remains is mostly
    MapLibre `_setupPainter` and three.js shader compile under software
    GL.
- **Facilities on the street map** — zooming past map-zoom ~10.5 shows
  dots for every bundled real data center and the user's placements on
  the street map itself (names appear from zoom 12); the layers are
  re-hoisted above the opaque OSM fills when tiles attach.
- **Co-location warning** — placing within 40 km of a bundled data
  center or another of your placements flags it in the inspector
  ("⚠ 21 km from Bulk Sofia — shared grid feed, cooling water, land").
  `COLOCATION_KM` in `src/lib/osm/dataCenters.ts`.
- **Data-center profile follows the timeline** — clicking a real DC dot
  projects its grid intensity along the country's real Ember slope,
  PUE improving like any operating facility (`PROJECTED → year` badge).
- **City search** — search field in the header (`CitySearchBar` over the
  `CITIES` dataset in `src/lib/cities.ts`: every Bulgarian town with city
  status above ~10k inhabitants, plus major world cities). Prefix matches
  rank above substring matches; keyboard navigation (arrows / Enter /
  Escape). Picking a city arcs the camera over the globe to the site
  (`CameraFlyTo` in `Globe.tsx`, 2.6 s ease-in-out; orbit controls are
  suspended during the flight). European destinations continue down into
  the street map (see the street zoom above); non-European ones settle in
  close orbit. Coordinates are approximate (2 decimals) —
  plenty for camera navigation.
- **About page** — the ABOUT button at the header's right end opens a
  fullscreen console-styled overlay (`AboutOverlay.tsx`): what the app
  does, a spec strip, controls, data sources (NASA POWER / Climate TRACE /
  Ember / OSM), the EST-vs-LIVE badge disclaimer and a crew manifest with
  a card per team member (hex monogram, role, bio, skill tags; per-member
  accent tokens `--crew-*` in `global.css`). Not routed — the app is a
  single fixed-viewport dashboard, so the page is an overlay; ESC, the ✕
  button or a backdrop click closes it. It is portaled to `<body>` because
  the GSAP reveal leaves a transform on the header, which would otherwise
  become the containing block for a fixed-position child and clip the
  overlay to the header strip (same class of gotcha as the header
  z-index note in `app.css`).

## Data provenance & AI explanations (round 4)

**Single source of truth:** `src/lib/explain.ts` → `buildMarkerView(marker, t)`
computes every number the placed-facility inspector shows, each as a
`ViewMetric` with `provenance` (`REAL` / `DERIVED` / `SYNTHETIC`), a
source dataset and a one-line formula. The inspector renders from it and
`buildExplainSnapshot` serializes it for the AI, so both always agree.

Badges (`ui/ProvenanceBadge.tsx`): **REAL** (green, dataset named),
**DERIVED** (cyan: formula over real inputs, or interpolated/trended),
**EST** (grey: model assumption), plus **PROJ** (purple) when a real
value is carried along the timeline. The old card-wide
"LIVE · CLIMATE TRACE" badge on the Site card is gone (it was wrong for
everything but the national CO₂).

Sidebar audit outcome (2026-10-04):
- Removed: Street View (Mapillary) card + `lib/mapillary`, the
  synthetic climate-zone line, the 30-day NASA POWER solar card (merged
  into the Solar verdict, which now uses the long-term annual mean), the
  fake "°C local" waste-heat rise, the fake water "k m³/d before" volume.
- Grounded: national electricity demand + renewable share from bundled
  Ember (`src/lib/data/ember-demand-renewables.csv`, both projected along
  their own trends); NASA POWER monthly climatology (annual normals for
  temperature/solar/wind + seasonality); site-specific energy footprint
  (PV yield = 200 MWp/km² × site irradiance × PR 0.8; wind turbine CF
  from site wind scaled to 100 m with α = 0.143); DATA CENTER PROFILE
  grid intensity from Ember via nearest country (city table = fallback).
- Still synthetic (badged EST): facility nameplate load per kind, demand
  scenario rates, PUE coefficients, water-use factor, weights of the
  suitability score.

**AI explanation card** (`inspector/ExplainPanel.tsx`, bottom of the
inspector): button-triggered only. It posts the snapshot (site, kind,
scenario, placed + selected month `YYYY-MM`, metrics with `initial` (placement
month) and `projected` (selected month, when the timeline moved), units,
provenance, formula text, verdicts) to `POST /api/explain`. Answers are
memoized per snapshot on the client; after scrubbing, the old answer
dims with a "Re-explain for <month>" button. Without `GEMINI_API_KEY` on
the backend the card shows the 503 message.

## Source Layout

```text
src/
├── assets/textures/earth/  # NASA Blue Marble textures + CREDITS.md
├── components/
│   ├── globe/              # Canvas scene, Earth, markers, ghost preview,
│   │                       # type picker (AddObjectControl), popup, hints,
│   │                       # country data overlays (DataOverlays),
│   │                       # street-level map layer (StreetLevel, MapLibre)
│   ├── hud/                # left column: global totals
│   ├── inspector/          # right column: before/after impact
│   ├── intro/              # opening boot sequence overlay (GSAP + MapLibre)
│   ├── layout/             # app header + about overlay
│   ├── search/             # header city search bar + results dropdown
│   ├── timeline/           # bottom simulation timeline
│   └── ui/                 # MetricCard, ComparisonCard, IconButton, …
├── lib/
│   ├── basemap.ts          # shared MapLibre style + tile server config
│   ├── cities.ts           # city dataset (Bulgarian towns + world cities)
│   ├── climatetrace/       # Climate TRACE v7 client + country centroids
│   ├── power/              # NASA POWER client (our Java backend proxy)
│   ├── projection.ts       # timeline year-by-year projection model
│   │                       # (2026–2050; extrapolates TRACE/POWER data)
│   ├── geo.ts              # three-free lat/lon types + label/distance
│   │                       # helpers (safe for the entry chunk)
│   ├── geo3d.ts            # the three.js-dependent conversions
│   │                       # (latLonToVector3, raySphereHit,
│   │                       # vector3ToLatLon) — globe chunks only, or
│   │                       # the render library rides into first paint
│   ├── cameraTelemetry.ts  # per-frame camera position shared between the
│   │                       # R3F scene and the street map (no re-renders)
│   ├── maplibreWorker.ts   # MapLibre 6 worker-URL wiring for Vite
│   │                       # (must import before the first map — see
│   │                       # "Street-level map internals" below)
│   └── simulation.ts       # marker kinds + heuristic impact model +
│                           # live-data enrichment (TRACE, POWER)
├── styles/
│   ├── global.css          # reset + design tokens (CSS variables)
│   ├── app.css             # frame, header, dashboard grid + responsive
│   ├── intro.css           # opening boot-sequence overlay
│   └── panels.css          # cards, viewport chrome, timeline, popups
├── App.tsx                 # app shell + simulation state (useState)
└── main.tsx                # entry point
```

## Environment Variables

Optional (`src/vite-env.d.ts` declares the types; defaults target the
minipc via mDNS — `dminipc.local` resolves on the team hotspot whatever
IP it gets — so most machines need nothing):

```bash
VITE_POWER_API_BASE=http://dminipc.local:8080   # NASA POWER backend
VITE_TILES_BASE=http://dminipc.local:8081       # PMTiles tile server
#                                               # (8082 = Balkans early access,
#                                               #  see docs/ops/tile-build-pc.md)
```

Set them in `.env.local` (git-ignored) to override; `.env.example`
documents the same keys.

## Street-Level Map Internals (read before touching StreetLevel.tsx)

Hard-won behaviors; each of these cost a debugging round:

- **Host must keep its size** — the host `.street-level__map` sits on
  the same element as `.maplibregl-map { position: relative }`. Its own
  rule uses a doubled class so it wins regardless of the order in which
  the lazy chunks load stylesheets. If the host ever reads
  `clientHeight === 0`, the crossfade silently never engages (see
  Boot-path round 3).

- **Worker URL** — MapLibre 6 loads its web worker from a file next to
  its own script; Vite's dep cache moves the library and the relative
  URL breaks ("Worker failed to load" → completely blank map). Fix:
  `src/lib/maplibreWorker.ts` does `setWorkerUrl(import('…?worker&url'))`
  and must be imported **before the first map is created**. Since the
  lazy-chunk split (2026-10-04) either `IntroOverlay` or `StreetLevel`
  can create the first map, so both import the fix.
- **Never put a maybe-dead source in the initial style** — MapLibre
  stalls the *entire* style while source metadata fails to load, so an
  unreachable tile server blanks even unrelated layers. The map starts
  with the graticule-only style; the OSM source + layers are added only
  after the tilejson probe succeeds.
- **Camera ↔ zoom mapping** — the map mirrors the globe camera every
  frame (in a rAF loop, never React state): center = surface point under
  the camera (`vector3ToLatLon`), zoom derived by matching
  meters-per-pixel between camera altitude and MapLibre
  (`zoomForCamera`). The crossfade band is map-zoom 8.25–9.6, with the
  radial render-distance mask running inside it (see the feature list
  above); every per-frame DOM write is change-guarded or the masked
  layer re-rasterizes per frame.
- **The map is non-interactive** (`interactive: false`, wrapper has
  `pointer-events: none`) — OrbitControls stays the single input
  surface; rotate = pan at street level.
- **Adaptive near-plane** — at street zoom the globe surface is ~hundreds
  of meters from the camera; a fixed near plane (R3F default 0.1)
  would clip everything. `CameraTelemetry` in `Globe.tsx` tightens
  `camera.near` each frame.
- **Prewarm** — picking a city jumps the (still-invisible) map to the
  destination at z13.5 so tiles are fetched during the fly-to; the
  camera sync takes over as soon as the crossfade starts.
- **Diagnostics** — every stage logs `[street-level] …` to the console
  (map loaded, OSM layers added, tile server unreachable, crossfade
  engaged at which zoom). Check the console first when the map is blank.
- Tile server side (archive build, pmtiles serve, systemd units) is
  documented in `docs/ops/minipc.md`.

## Styling Conventions

- All colors/fonts/glow values live as CSS variables in
  `src/styles/global.css` — do not scatter hex values through components.
- Use CSS classes in the stylesheet(s), not inline `style` attributes
  (exception: dynamic per-object accent colors passed from data, e.g.
  marker kind accents).
- Keep CSS files from growing unboundedly; splitting per area is fine.
- Tailwind is intentionally not used; only reconsider if it offers a clear
  animation/preset advantage.

## Design Direction (preserve)

Dark control-room aesthetic: very dark navy background, thin 1–2px cyan
outlines with restrained glow, blue-highlighted central viewport,
purple/magenta timeline, compact monospace technical typography. The design
must still read correctly with all glow removed. Interaction transitions
100–250 ms.

## Planned / TODO

- **Block impossible placement sites** — currently any surface click is
  accepted. Restrict to plausible locations: reject oceans/seas/lakes
  (a bundled land-polygon dataset + point-in-polygon test at click time
  is the cheap route; Natural Earth 110m land is tiny) and optionally
  high mountains/glaciers (NASA POWER can return site elevation — the
  enrichment already calls it, so an ELEV threshold needs no extra
  request). Surface a clear "cannot build on water" hint instead of the
  ghost placing.
- **Solar stats sanity** — the POWER card can show implausible values
  (e.g. 248 kWh/m²·d avg; physical max ≈ 8). Suspect the backend
  computes stats over the wrong series/units — verify `PowerApiServer`
  `/api/solar` before trusting the min/max/avg.
