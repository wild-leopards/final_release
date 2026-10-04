# Timeline Formula Reference

Every number the timeline (2026 → 2050) shows, where it comes from, and
exactly where it is computed. Model philosophy: **deterministic and
explainable** — each value is one documented formula over real data
(Climate TRACE, NASA POWER, Ember, WRI Aqueduct), never random, never
fitted to data we don't have. Constants live next to their formulas.

Notation: `Y` = scrubbed timeline year, `Y₀` = `TIMELINE_START_YEAR`
(2026), `Yp` = the facility's placement year, `T` = facility kind.

One caveat on precision: constants marked **screening default** are
sensible assumptions, not literature-measured values — the researched
literature values and their citations are in §6 (full sources in
[docs/CREDITS.md](../CREDITS.md) and
[docs/research/formula-research1.md](../research/formula-research1.md)).

## 1. Grid carbon intensity (gCO₂/kWh) — the core driver

| What | Formula | Where |
|---|---|---|
| Real starting value | `emberByIso3[country].latestG` (2024) | `src/lib/data/datasets.ts` (`loadEmber`) |
| Country trend slope | least-squares regression of `ln(g)` vs year over 2010–2024, as %/yr, clamped ±6 | `datasets.ts` → `emberSlopePctPerYear(iso3)` |
| Projection | compound the slope yearly; **rising** trends halve their effective slope each year after 2040 (S-bend); clamp to [20, 1000] | `projection.ts` → `projectGridIntensity(g, yStart, slope, Y)` |
| Heuristic fallback (no Ember) | renewable share +1.5 pp/yr → 95 % cap; `gridIntensityOf(share) = 750·(1−s) + 45·s` | `projection.ts` → `projectBaseline`; `simulation.ts` → `gridIntensityOf` |
| What the UI uses | `effectiveGridIntensity(baseline)` = real Ember g when attached, heuristic mapping otherwise | `simulation.ts` |

Clamps (screening defaults, deliberately artificial — research flags
that no universal floor/ceiling/cap exists; see §6.5): `GRID_FLOOR_G =
20`, `GRID_CEILING_G = 1000`, `MAX_SLOPE_PCT_PER_YEAR = 6`,
`GRID_BEND_YEAR = 2040`.

Accounting note (from the research pass): Ember's historical estimates
are **lifecycle CO₂e**; IEA/NGFS scenario emissions may use a different
boundary — if/when we switch to published scenario curves (§6.5) the
boundary must match on both sides of the baseline.

## 2. Country CO₂ emissions (the BEFORE value)

- Start: Climate TRACE country total for 2024 (`findCountryRanking`,
  `src/lib/climatetrace/api.ts`), attached at placement by
  `enrichMarkerWithClimateTrace` (`src/lib/simulation.ts`).
- Projection: compound the country's real TRACE year-over-year percent
  change, **clamped to ±10 %/yr**, one year per scrubbed year (1/12 per month) from the
  timeline start (2026 shows the raw 2024 measurement, so the first
  step applies exactly one year of trend, not the whole 2024→2027 gap):
  `co2(Y) = co2(2024) · (1 + Δ/100)^max(0, Y − max(2024, 2026))` —
  `projection.ts` → `projectBaseline`. Countries without TRACE data
  stay flat (no real trend to extrapolate).

## 3. Facility footprint (the AFTER deltas)

Base equations (identical at placement and per projected year) live in
`src/lib/simulation.ts` → `estimateImpact`; the year-by-year version is
`projection.ts` → `projectImpact(marker, Y)`:

- **Load ramp**: `ramp(Y) = clamp01(0.5 + 0.5 · (Y − Yp) / 2)` — half
  load in the placement year, 75 % at `Yp + 1`, full load from
  `Yp + 2` on; before `Yp` the facility doesn't exist (all-zero
  footprint, "Not built until …").
- **Actual IT load** (§4 scenarios): `IT(Y) = capacityMW · demand(Y) ·
  ramp(Y)` — nameplate scaled by the demand scenario and the ramp.
- **PUE**: `pue(Y) = max(1.15, pue₀ − 0.005·(Y − Yp))`, where
  `pue₀ = 1.2 + max(0, T₀ − 15)·0.005 + kindBias` (hotter site = costlier
  cooling; `T₀` is the real NASA POWER 30-day mean temperature). The
  0.005/°C slope, the auto-improvement and the 1.15 floor are all
  screening defaults — research flags better functional forms (§6.2/6.3).
- **Energy**: `E(Y) = IT(Y) · pue(Y) · 8.76` (GWh/yr; 8.76 = 8760 h / 1000).
- **CO₂**: `CO₂(Y) = E(Y) · g(Y) / 1000` (kt/yr, with `g` from §1).
- **Cooling water**: `W(Y) = E(Y) · 1e6 · f / 365 / 1000` m³/day with
  `f = 1.9 L/kWh` above 10 °C mean, `0.9` below (screening default;
  technology-specific WUE values in §6.4).
- **Waste heat**: `Q(Y) = IT(Y) · (pue(Y) − 1)` (MW thermal).
  ⚠ Research flags this as **physically incomplete** — it counts only
  the cooling/power overhead; full heat ≈ total facility electricity,
  i.e. `IT(Y) · pue(Y)` (see §6.7 — kept unchanged so far, UI shows the
  underestimated value).
- **Temperature drift feeding PUE/cooling**: `T(Y) = T₀ + 0.03·(Y − Y₀)`
  (`WARMING_C_PER_YEAR`, §6.6).

Aggregation across facilities: `timelineSummary(markers, Y)`
(`projection.ts`) — sums §3 over markers with `Yp ≤ Y`, keeping
**nameplate** (`capacityMw`) and **actual load** (`itLoadMw`) separate;
the HUD shows the actual load and its ×nameplate factor. Placement-time
snapshot (`estimateImpact`): `IT = capacityMW` (demand starts at ×1).

## 4. Operations / demand scenarios (BUILT 2026-10-03)

Per-facility demand-growth profile, editable in the inspector.

**Data model** — `simulation.ts`: `OperationsProfile { scenario,
annualDemandGrowthPct }` on `PlacedMarker`; `OPERATIONS_SCENARIOS`
preset table; `defaultOperationsForKind(kind)`.

**Formula** — `projection.ts` → `demandFactor(operations, Yp, Y)`:

```
demand(Y) = clamp( (1 + g/100)^max(0, Y − Yp), 0.05 … 3 )
```

`g` = scenario's %/yr (negative for decline). The ×3 cap
(`DEMAND_FACTOR_MAX`) is the physical capacity limit — a site cannot
outgrow its grid connection and cooling plant; growth flattens at the
cap (this is the researched "site load growth must be
capacity-constrained" rule). Decline floors at ×0.05
(`DEMAND_FACTOR_MIN`; a facility can idle, not go negative). All
downstream §3 quantities scale with `IT(Y)`.

**Scenario presets** (rate applied when the user picks one; cited in
§6.2 / docs/CREDITS.md):

| Scenario | Annual growth | Anchored to |
|---|---|---|
| `steady` | 0 %/yr | existing fully occupied site — no automatic growth |
| `growth` | +9 %/yr | IEA conventional-server electricity growth proxy |
| `viral` | +35 %/yr | honest AI worst case (mid of the researched 30–40 %) |
| `decline` | −10 %/yr | demand collapse / decommissioning path |

**Kind defaults at placement** (`defaultOperationsForKind`):

| Kind | Default | Rate | Basis |
|---|---|---|---|
| AI Data Center | growth | +25 %/yr | IEA 2026: AI-focused centers roughly triple 2025–2030 → ≈24.6 %/yr CAGR |
| Crypto Mining Farm | growth | +17 %/yr | Cambridge CCAF 2025: ≈17 % YoY observed electricity growth |
| Data Center | steady | 0 %/yr | no published per-site colo growth; expansion is explicit |
| Factory | steady | 0 %/yr | industrial load assumed flat |
| custom-… | steady | 0 %/yr | user-defined |

(research note: these are **trend anchors, not site measurements** —
sector growth ≠ any one facility's growth; the ×3 cap is what models
the site limit; crypto volatility is intentionally represented by its
observed average trend — the deterministic model has no randomness.)

**Where it surfaces in the UI**:

- Inspector `OperationsCard` (`RegionalInspector.tsx`): dropdown of the
  four presets (rate in the option label) + the year's load note
  ("Demand +35%/yr — 2050 load ×3.0 nameplate (capped at ×3)").
- Inspector subtitle: `rampStatus` (`projection.ts`) appends
  `· demand ×N nameplate` or `· at capacity (×3)`.
- Global HUD (`GlobalHud.tsx`): "Active IT Load" card sums actual load
  and shows `×N nameplate from demand growth` when the fleet exceeds
  its nameplate.
- Relocation keeps the scenario: `App.tsx` re-founds the marker with
  `createMarker` but carries `operations` across; in-flight
  enrichment responses merged back never clobber a user-edit
  (`operations` preserved on merge).

## 5. Suitability verdicts (per-kind, also year-reactive)

`src/lib/suitability.ts` → `siteSuitability(baseline, kind)`: threshold
tables (cooling good ≤10 °C / bad >20 °C; water bad at Aqueduct
category ≥3; grid good ≤120 g / bad >400 g; solar good ≥4.5 / bad <3
kWh/m²·d; altitude bad >2500 m), weighted per facility kind, each
verdict labeled with its data source. Missing data drops the criterion
rather than guessing. See
[docs/frontend/suitability.md](suitability.md).

## 6. Research-anchored constants (Work package 2, folded 2026-10-03)

Source: ChatGPT deep-research pass with citations —
[docs/research/formula-research1.md](../research/formula-research1.md)
(raw output); distilled citations in [docs/CREDITS.md](../CREDITS.md).
Published values vs what we ship today; **the shipped screening values
stay until someone implements the better forms** (each is one local
function; the docs above should be updated with the code).

### 6.1 PUE vs ambient temperature

- No universal PUE–temperature curve; ASHRAE envelope classes are not
  PUE curves. Defensible form: hourly energy balance, or a per-cooling-
  class surrogate `PUE_h = 1 + a_c + P_fixed,c/P_IT,h + b_c·max(0, X_h −
  X_0,c)` (X = dry-bulb / wet-bulb / inlet temp by class).
- Screening defaults (rounded, not industry CIs): air-cooled DX/chiller
  **1.50 [1.30–1.80]**; water-cooled chiller+tower **1.40 [1.20–1.70]**;
  evaporative/adiabatic airside economizer **1.20 [1.10–1.40]**;
  warm-water direct liquid/immersion with dry rejection **1.10
  [1.05–1.25]**; unknown existing facility **1.54 [1.30–2.00]**
  (Uptime 2025 survey average). DOE documents a liquid-cooled hybrid at
  **PUE 1.06** — so 1.15 is not a physical floor.

### 6.2 IT-load growth (drives our scenario presets)

- Sector-level evidence: IEA ~**12 %/yr** growth of all DC electricity
  2019–2024 (415 TWh 2024); **2025: all DC +17 % → 485 TWh, AI-focused
  +50 %**; AI-focused electricity ~triples 2025–2030 → **≈24.6 %/yr
  CAGR**; conventional-server growth projected **9 %/yr to 2030**;
  accelerated-server electricity **30 %/yr** (IEA 2025 outlook,
  945 TWh 2030). Cambridge CCAF 2025: Bitcoin ≈**138 TWh, ≈17 % YoY**.
- **Sector growth ≠ site growth** — a site is capacity-constrained
  (our `DEMAND_FACTOR_MAX = 3` encodes this); "colocation" is an
  ownership category, training/inference are workloads. No verified
  site-level per-year load distributions exist for any category — our
  scenario table is the honest screening form of this.
- Research's explicit scenario table (our presets above implement the
  capacity-constrained version): fully occupied site **0 %** (expansion
  = explicit event); expanding AI fleet **0/9/15 → 10/25/40 %/yr**
  bounds to 2030; general compute **0/9/15 %**; crypto **0 % automatic**
  (we default it to the observed 17 %/yr instead — flagged divergence);
  **do not compound 25–30 % to 2050** (our cap does this implicitly:
  +35 %/yr hits the ×3 cap by 2033, +25 % by 2035, +17 % by 2038).

### 6.3 PUE improvement over time

- Research recommends **0 automatic improvement for an unchanged
  facility** (aging facilities don't retrofit themselves) or an
  asymptotic efficiency scenario `PUE_y = PUE_min + (PUE0 − PUE_min)·
  e^(−k·(y−y0))` with analyst-chosen **k = 0–0.03/yr**. Our linear
  0.005/yr is the labeled smooth scenario.

### 6.4 Cooling water / WUE

- Standard WUE denominator is **IT electricity**, not facility energy
  (`V_site = E_IT · WUE`). Research flags our facility-energy
  denominator as a correction to make (WUE × PUE larger effective
  values if moved to total energy). Mytton (npj Clean Water 2021)
  distinguishes onsite vs electricity-generation water.
- Screening defaults by heat-rejection technology (L/kWh IT): dry
  air-cooled **0 [0–0.1]**; adiabatic-assisted **0.3 [0–1.0]**; direct
  evaporative **0.8 [0.2–2.0]**; chilled-water + wet tower **2.0
  [1.0–3.0]**; immersion/liquid + wet rejection **1.0 [0.2–2.5]** (DOE
  hybrid example: WUE **0.7**). Tower cross-check:
  `V_evap ≈ 1.47·f_latent·Q_rejected` (h_fg ≈ 2.45 MJ/kg), makeup
  `V_makeup ≈ V_evap·C/(C−1)` with cycles of concentration **C = 4**
  [3–6]. Report withdrawal vs consumption separately. Our flat
  1.9/0.9 split at 10 °C stays — flagged in §6.7.

### 6.5 Grid-intensity projections

- Research: **prefer published scenario trajectories** over regressed
  historical slopes where available — IEA WEO 2025 free dataset
  (selected coverage), NGFS scenarios (downscaled to 184 countries,
  electricity variables per model/country to verify), national
  scenarios, NREL Cambium (US-only, hourly + marginal emissions — the
  right tool for "adding load" questions). Ember stays the historical
  baseline; its standard dataset is not an NZE/STEPS projection.
- When we adopt scenario curves: interpolate between published years,
  use **generation shares not capacity shares**, keep the emissions
  boundary consistent (Ember = lifecycle CO₂e), and drop the universal
  20/1000 clamps to labeled safeguards. Before/after labels should say
  **attributed footprint** (average-intensity multiplication), not
  marginal grid impact.

### 6.6 Regional warming rates (SSP2-4.5, 2026–2050 window)

- Our flat `0.03 °C/yr` is a rough global-ish sensitivity, not a
  projection. Research computed per-region trends (10th–90th pct
  across a 34-model land ensemble, IPCC-WG1/Atlas CMIP6 SSP2-4.5;
  method + full table in the research file): Northern Europe
  median **0.41** °C/decade [P10–P90 −0.03…0.67], W/C Europe **0.34**
  [−0.03…0.67], E Europe **0.54** [0.04…0.82], Mediterranean **0.29**
  [0.11…0.50], Central N. America **0.46** [0.18…0.74], Sahara **0.34**
  [0.15…0.50], South Asia **0.36** [0.21…0.46], East Asia **0.32**
  [0.19…0.49], SE Asia **0.26** [0.16…0.37], S. Australia **0.29**
  [0.13…0.45], Russian Arctic **0.74** [0.18…0.97]. Site-local
  alternative: World Bank CCKP downscaled CMIP6 monthly anomalies.

### 6.7 Physically wrong or misleading (flagged, not yet changed)

| Our model element | Research verdict | Correction (when implemented) |
|---|---|---|
| `wasteHeat = IT·(PUE−1)` | counts only overhead; **omits IT heat** | total heat ≈ facility electricity: `IT·pue` |
| water from total E × 1.9/0.9 at a 10 °C break | no universal 10 °C threshold; wrong WUE denominator | WUE × IT energy, by cooling technology (§6.4) |
| PUE auto-improves every year | facilities don't retrofit themselves | 0 automatic; explicit retrofit years (§6.3) |
| PUE floor 1.15 | 1.06 demonstrated; floor is 1.0 | design-specific minimum |
| grid floor/ceiling 20/1000 + ±6 %/yr cap | not general physical bounds | labeled safeguards or published scenario curves (§6.5) |
| "CO₂" label over Ember data | Ember is lifecycle **CO₂e** | label emissions boundary accurately |
| unlimited site growth | grid/cooling capacity limits | ✅ already fixed — `DEMAND_FACTOR_MAX = 3` |
| heat → local °C conversion in the UI | needs a dispersion/urban-climate model | never convert MW to local °C directly |
| all waste heat implicitly "there" | recoverability depends on temp/infrastructure | model usable heat separately if needed |

### 6.8 The captain's global feedback loop (KokiTasks.txt) — status

- "All CO₂ sources → one global variable" — theClimate TRACE total
  (`fetchGlobalTotal`, HUD "World CO₂e") plus our fleet's added kt/yr
  (`timelineSummary`) are already aggregated as separate totals.
- "Temperature responds to emissions" — **partial**: temperature →
  PUE → energy → CO₂ is wired (§3), but the reverse edge
  (emissions → temperature) is a fixed 0.03 °C/yr drift, not driven by
  the totals. A citable mechanism for a future pass: IPCC AR6 WG1 SPM
  quasi-linear TCRE — **≈0.45 °C (0.27–0.63) per 1000 GtCO₂ cumulative**
  — tiny at our kt-scale but the correct honest constant; it would be
  dominated by the real-world background drift anyway.

## Known simplifications (deliberate, hackathon-scoped)

- Linear PUE improvement, constant warming drift, no seasonal cycle
  (timeline steps whole years); synthetic facility PUE slope/breakpoint.
- One grid number per country (Ember national average); country
  resolution is nearest-centroid.
- Demand scenarios compound one rate per facility (no volatility
  oscillation — deterministic by design); capacity-expansion events on
  one site are out of scope (the ×3 constant stands in for them).
- Screening defaults where literature values need per-hour/per-
  technology models; see §6 for the researched replacements.

## Verification

- `pnpm lint` + `pnpm build` must pass (each WP).
- Headless-chrome E2E walkthrough per feature incl. the scenario
  checks: see [docs/frontend/verification.md](verification.md) and the
  team memory recipe `.claude/memory/mac-e2e-headless-chrome.md`.
- Spot maths: viral +35 %/yr placed 2026 crosses the ×3 cap at n=3.7
  operating years → factor pinned at 3 from 2030 (UI subtitle
  "Operational · at capacity (×3)" from then); AI-default +25 %/yr
  reaches ×3 at n≈4.9 → from 2031; crypto +17 %/yr at n≈7.0 → from
  2033; decline −10 %/yr → ×0.08 by 2050 (UI rounds ×0.1); steady →
  ×1.0 forever.
- Scenario E2E evidence (2026-10-03 session): AI DC placed in
  Guatemala; viral delta +2631 GWh/yr at 2050 vs steady +877 = 3.0×;
  HUD 240 MW ×3.0 nameplate capped; decline ×0.08 (6 MW shown).
