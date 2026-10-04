# Site Suitability — per-kind verdicts from real data (BUILT 2026-10-03)

Team decision (2026-10-03): per-kind site verdicts — "this place is not
good for X because …" — powered by real data, with correctness as the
first constraint: every verdict cites the real datum behind it,
heuristic fallbacks must be labeled, and all numbers must pass sanity
ranges. Implemented same day; this doc now describes the built system.

Companion docs: `projection.md` (the timeline model this extends),
`docs/ops/minipc.md` (backend deploy), `docs/backend/deployment.md`.

## Data sources (all free, no keys)

| Input | Source | Status |
|---|---|---|
| Site temperature (T2M) | NASA POWER via our backend | live |
| Solar irradiation | NASA POWER via our backend | live, units fixed (below) |
| Elevation, wind (WS2M), humidity (RH2M), precipitation (PRECTOTCORR) | NASA POWER via our backend | live (backend fixed, below) |
| Grid carbon intensity gCO₂/kWh + 2010–2024 history | Ember Yearly Electricity Data (CC-BY 4.0), ember-energy.org/data | bundled, live |
| Country water-stress rating | WRI Aqueduct Country Rankings (CC-BY 4.0) | bundled, live |

Bundled as small CSVs under `src/lib/data/` with a CREDITS.md — no new
dependencies, parsed once at module load, offline-safe. Loader:
`src/lib/data/datasets.ts`.

## Backend fixes (both verified live 2026-10-03)

1. **Solar units**: POWER's current daily-point responses report
   `ALLSKY_SFC_SW_DWN` as daily-mean **W/m²** (`"units": "W m-2"` in
   the response header), not kWh/m²/day. The backend now reads the
   `units` field and converts (× 0.024 = W/m² × 24 h → kWh/m²/day),
   then clamps to the physical max 8. Verified: Sofia Sept avg
   4.32 kWh/m²/d; Phoenix July 2024 avg 7.69 (< 8).
2. **Multi-parameter weather**: raw commas in the parameter list were
   never the problem — `ELEV` simply is not a valid POWER parameter in
   ANY community (422 upstream). The backend now serves a pseudo-
   parameter `ELEV` from the GeoJSON geometry z-coordinate (every
   point response carries the grid-cell elevation), passes the rest
   through URL-encoded, and sanity-clamps known parameters
   (T2M −50..50 °C, ELEV −400..9000 m, WS2M 0..40 m/s, RH 0..100 %,
   PRECTOTCORR 0..200 mm/day).

## Module: `src/lib/suitability.ts` (pure functions)

`siteSuitability(baseline, kind) → { score: 0–100, verdicts: Verdict[] }`
where `Verdict = { criterion, level: 'good'|'ok'|'bad', text, source }`.
Same style as `projection.ts`: documented threshold tables, one formula
per number, deterministic, no randomness. Thresholds: cooling good
≤ 10 °C / bad > 20 °C; water bad at Aqueduct cat ≥ 3 (or cat 2 + hot);
grid good ≤ 120 g / bad > 400 g; solar good ≥ 4.5 / bad < 3 kWh/m²·d;
altitude bad > 2500 m. Weights per kind are documented in the module
(custom kinds use the factory profile). Missing data drops the
criterion from the score instead of guessing; heuristic fallbacks
(temperature, water index, grid share) are labeled `HEURISTIC`.

`outlookSummary(latLon, kind)` — the placement-mode one-liner: real
Ember grid + Aqueduct water for the country under the cursor plus a
latitude-band cooling estimate (labeled "lat est."). No POWER request
per pointer move: the ghost preview reports the cursor site at most
~2×/s on ≥ 2° moves, and real satellite weather attaches on click.

## Projection upgrade (BUILT — see projection.md)

Per-country real slopes regressed from each country's Ember intensity
history (2010–2024, ln-slope, clamped ±6 %/yr), floor 20 / ceiling
1000 gCO₂/kWh, rising trends S-curve-bend after 2040. Unknown country
→ world slope, labeled `gridSlopeSource: 'world'`.

## UI (BUILT)

- **Inspector**: "SITE ASSESSMENT" card under the street-level card,
  re-evaluated at the scrubbed year (projected temp/grid flow in, with
  a `PROJECTED →` badge and "Ember trend from 2024" wording). Redesigned
  2026-10-04 into a traffic-light checklist: score header ("72 / 100 ·
  GOOD FIT"), then one row per criterion — ✓/⚠/✕ icon colored by level,
  `CRITERION — GOOD/FAIR/POOR`, a plain-language verdict line, the
  numbers behind it as a smaller detail line, and the data source
  badged. All criteria are listed (not just the worst 3); pending data
  (e.g. solar before POWER attaches) renders dim with an `…` icon and
  stays out of the score. `Verdict` now carries `headline` + `detail`
  + optional `pending` instead of one dense `text` string.
- **Placement mode**: one-line outlook under the ghost-preview label
  ("Data Center: ok cooling (lat est.) · dirty grid · tight water").

## Known limitations (accepted)

- Aqueduct is a COUNTRY average — it says Low–Medium for the US while
  Arizona is Extremely High; the precipitation datum partially covers
  this (Phoenix still scores 15/100 via hot+dry+High-stress match).
- Country resolution is nearest-centroid (`countryCentroids.ts`) with
  cos-lon scaling; big-country clicks can match a neighbour (Phoenix
  → Mexico City is genuinely closer than the Kansas centroid) and
  coastal clicks far from any centroid resolve to no country.

## Verification results (2026-10-03, all against the live fixed backend)

- [x] Solar fixed: Sofia 30-day avg 4.32 kWh/m²/d (Sept); Phoenix
      July-2024 7.69 < 8.
- [x] Sanity clamps live in the backend for T2M/ELEV/WS2M/RH2M/PRECIP.
- [x] Spot checks (30-day real POWER + bundled Ember/Aqueduct):
  - Phoenix 33.45,−112.1 (AI DC): 29.6 °C, Aqueduct High, dirty grid →
    score 15/100 — bad cooling, water, grid; good solar/altitude.
  - S. Norway 59.9,10.7 (DC): 11.4 °C, 30 g grid, Low water → 77/100.
  - Poland 52.2,19.5 (AI DC): grid 608 g (Ember 2024) → 57/100, bad
    grid verdict ≈577 kt CO₂/yr; 2050 grid 336 g → score 71.
  - Iceland 64.9,−18.6 (DC): 3.2 °C, 28 g, Low water → 90/100.
  - Sofia 42.7,23.3 (crypto): all criteria ok (16.8 °C, 279 g, cat 2,
    4.3 kWh/m²·d) → 57/100 — "mid everything" as expected.
- [x] Ember extract 3130 rows / 210 countries vs upstream 104k-row
      release; Aqueduct 162 rated countries; CREDITS.md present.
- [x] `pnpm lint` + `pnpm build` pass; headless-Chrome E2E (memory
      recipe): marker placed end-to-end with live TRACE + POWER +
      Ember + Aqueduct enrichment, assessment card rendered, timeline
      scrub re-projects the verdicts.
