# Climate TRACE Integration — Real Emissions Data

The globe dashboard now attaches **real, satellite-derived emissions data**
from [Climate TRACE](https://climatetrace.org) to every placed facility.

## Live API (v7)

Base: `https://api.climatetrace.org/v7` — free, keyless, CORS-enabled.
Docs: <https://api.climatetrace.org/v7> (OpenAPI at `/v7/docs/openapi.json`).

| Endpoint used | Purpose | Coverage |
| --- | --- | --- |
| `GET /rankings/countries?start=YYYY&end=YYYY&gas=co2e_100yr` | National CO₂e totals, global rank, per-capita, YoY change, world share | Monthly, 2015 → present |
| `GET /sources?gadmId=ISO3&year=YYYY&gas=co2e_100yr&limit=N` | Top-emitting named facilities (power plants, refineries, mines…) | Yearly, 2021 → present |
| `GET /sources?year=YYYY&gas=co2e_100yr&limit=60` | **Biggest-threats layer**: the world's largest single sources, plotted on the globe | Yearly, 2021 → present |

## Biggest-threats globe layer

`BIGGEST THREATS` (toggle in the viewport header, on by default) plots
the 60 largest emission sources on Earth as dots at their real
coordinates (`ThreatDots.tsx`). Color = sector (power red, oil & gas
orange, forestry green…), size = annual emissions on a log scale;
hovering names the facility, its CO₂e and country — e.g. the West
Siberia conventional oil & gas basin (~235 Mt CO₂e/yr).

Reference year requested by the app: `TRACE_DATA_YEAR = 2024` (see
`src/lib/climatetrace/api.ts`).

## How a site resolves to real data

1. **lat/lon → country** — the clicked point is matched to the nearest
   country centroid from the bundled table in
   `src/lib/climatetrace/countryCentroids.ts` (no reverse-geocoding API).
   Points >15° from any centroid (open ocean) keep heuristic numbers.
2. **country → rankings row** — `findCountryRanking()` fetches (once per
   year, then cached in module scope) the national totals for
   `co2e_100yr`, replaces the synthetic `regionalCo2KtPerYear` in the
   marker's `RegionBaseline` and adds rank/share/per-capita/YoY fields.
3. **country → top facilities** — `fetchTopSources()` loads the five
   largest real assets in that country for the inspector panel
   (e.g. *Maritsa Iztok-2 power station*, *LUKOIL Neftochim Burgas
   Refinery* for Bulgaria).

Every response is cached per key; relocations re-resolve against the
API. All calls fail soft: if the network or endpoint hiccups, the marker
keeps its heuristic baseline and the UI shows an `HEURISTIC ESTIMATE`
badge instead of `LIVE · CLIMATE TRACE`.

## What is real vs. modelled

| Value | Source |
| --- | --- |
| National CO₂e, rank, share, per-capita, YoY | **Climate TRACE (live)** |
| Top facilities in country + their tonnes | **Climate TRACE (live)** |
| World CO₂e total in the HUD | **Climate TRACE (live)** |
| PUE, energy, water, waste-heat estimates | Deterministic model (`src/lib/simulation.ts`) |
| Temperature / grid mix / water stress | Heuristic placeholders |

## Files

- `src/lib/climatetrace/api.ts` — client, types, caching, formatters
- `src/lib/climatetrace/countryCentroids.ts` — ISO3 centroid table +
  `nearestCountry()` resolver
- `src/lib/simulation.ts` — `RegionBaseline` trace fields,
  `enrichMarkerWithClimateTrace()`
- `src/App.tsx` — fires enrichment on placement/relocation, stores
  per-marker trace context
- `src/components/inspector/RegionalInspector.tsx` — live badge, trace
  stats card, top-emitters list
- `src/components/hud/GlobalHud.tsx` — real world CO₂e card

## Notes

- Forest-sink countries can report **negative** net totals (e.g. Canada);
  the baseline clamps them to 0 so BEFORE/AFTER math stays sensible.
- `emissionsQuantity` is tonnes CO₂e (100-year GWP); the UI formats as
  kt / Mt / Gt via `formatTonnes()`.
- Bulking up coverage (per-source globe markers, sector filters, monthly
  series) needs only the same two endpoints — see `TraceDots`-style
  ideas in the worktree notes.
