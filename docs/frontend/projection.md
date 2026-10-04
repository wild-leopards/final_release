# Timeline Projection — "Compiling" Future Data from Real Data

The bottom timeline (`src/components/timeline/SimulationTimeline.tsx`) is a
year scrubber over **2026 → 2050**. At every year it re-derives the whole
dashboard — HUD totals and the inspector's BEFORE → AFTER rows — from the
projection model in `src/lib/projection.ts`.

## Principle

All future NUMBERS are deterministic, explainable extrapolations of the
real datasets attached at placement time:

- **Climate TRACE v7** — country CO₂e totals, and the country's real
  year-over-year change (`countryChangePct`);
- **NASA POWER** (via our backend) — 30-day satellite temperature/solar,
  which set the site's PUE and cooling baseline.

No randomness, no fitting to data we don't have. Every projected value is
one documented formula (below) over those real inputs.

## Model (all constants live in `src/lib/projection.ts`)

`projectBaseline(baseline, year)` — the region WITHOUT the facility:

- **Country CO₂** — compounds the real TRACE YoY change from the data
  year (2024) to the target year, clamped to ±10 %/yr so a single
  extreme reported swing can't explode over 25 years. Heuristic
  baselines (TRACE unavailable) stay flat — no real trend to extrapolate.
- **Grid carbon intensity** (since 2026-10-03) — each country's REAL
  Ember intensity (2010–2024, bundled) and its regressed slope
  (ln-slope in %/yr, clamped ±6 %/yr) compound year by year:
  floor 20 / ceiling 1000 gCO₂/kWh, rising trends decelerate after
  2040 (slope halves per year past it — an S-curve bend so dirty grids
  don't rise monotonically forever). Unknown countries use the world
  slope, labeled `gridSlopeSource: 'world'`. The displayed renewable
  share is derived back from the projected intensity
  (`shareFromIntensity`). Sites without Ember data keep the old
  heuristic: +1.5 pp/yr toward a 95 % cap.
- **Mean temperature** — +0.03 °C/yr warming drift (feeds PUE/cooling).

`projectImpact(marker, year)` — the facility's footprint at a year:

- **Construction ramp** — linear 0 → 100 % over 2 years after placement
  (the placement year averages half load). Before `placedYear` the
  facility does not exist yet: all-zero footprint, "Not built until Y"
  in the inspector.
- **Demand scenario** (since 2026-10-03) — every facility carries an
  `operations` profile (`{ scenario, annualDemandGrowthPct }`), default
  per kind (AI DCs +25 %/yr growth, crypto +17 %/yr, everything else
  steady — rates anchored in `docs/CREDITS.md`) and editable in the
  inspector's OPERATIONS card. The load multiplier compounds yearly
  and is clamped to ×0.05–3 of nameplate (`demandFactor` in
  `projection.ts`): growth can't outgrow the site's grid connection
  and cooling plant, so AI-style worst cases ("viral", +35 %/yr) hit
  the ×3 cap early in the timeline instead of compounding to ×430.
  Actual IT load = `nameplate × demand × ramp`; energy, CO₂, water and
  the waste-heat formula all scale with it. Formula reference:
  `docs/frontend/formulas.md` §4. (The planned AI briefing should
  narrate the active scenario.)
- **PUE** — improves 0.005/yr of operation, floor 1.15.
- **CO₂ / water / heat** — re-evaluate the same equations as
  `estimateImpact` in `simulation.ts` (shared `gridIntensityOf` helper)
  with the projected grid mix and temperature.

`timelineSummary(markers, year)` — HUD totals; only markers with
`placedYear <= year` are counted. It sums **nameplate** capacity and
**actual IT load** (nameplate × demand × ramp) separately; the HUD's
"Active IT Load" card shows the actual load and a
"×N nameplate from demand growth" note when the fleet is growing.

## UX contract

- `placedYear` follows the scrubber: placing an object while scrubbed to
  2032 founds it in 2032 (relocation re-founds at the current year too —
  and preserves the relocated marker's scenario).
- BEFORE = projected regional baseline (no facility); AFTER = baseline +
  projected facility impact, both at the scrub year.
- Honesty badges: the inspector keeps the **real observed TRACE card**
  (data year 2024) untouched and adds a `PROJECTED → <year>` badge when
  scrubbed; the HUD notes "Projected to <year>" on affected cards.
- The TRACE card's YoY arrow is exactly the number the trajectory
  compounds, so the UI explains its own extrapolation.
- Operations: the inspector's OPERATIONS card edits the facility's
  demand scenario (steady/growth/viral/decline, preset rates per
  scenario); the lifecycle line under the heading shows the load state
  ("Operational · demand ×1.8 nameplate", "… · at capacity (×3)"); the
  HUD shows the fleet's actual IT load whenever a scenario pushes it
  past nameplate.

## Playback

`App.tsx` owns `year` (a **fractional year**, one position per month:
Jan 2026 = 2026.0 … Dec 2050 = `TIMELINE_END_TIME`, 300 positions) +
`playing`; one month per 100 ms tick (full run ≈ 30 s), pauses at Dec
2050, play-from-end restarts. The track is scrubbable (pointer capture;
only month changes are reported), step buttons and ←/→ move one month,
Shift+←/→ one year. Label "Mar 2031"; ticks stay yearly (every 5th
taller). Helpers in `projection.ts`: `monthIndexOf`, `timeOfMonthIndex`,
`calendarMonth`, `formatMonth`, `isoMonth`.

### Monthly values

- Every trend model is closed-form in fractional `t`, so months are a
  smooth interpolation of the yearly curves (Ember grid slope via a
  log-linear fractional step, Climate TRACE YoY, Ember demand, renewable
  share, demand scenario, ramp, PUE drift, warming). Interpolated /
  trend-carried values are badged **DERIVED**, not REAL.
- Weather is **seasonal**: with NASA POWER climatology attached
  (`baseline.climatology`, `/api/climatology`), `projectBaseline(b, t)`
  uses the month's long-term normal temperature / solar / wind (+ the
  warming drift). PUE (`pueAt`) and cooling water (`wueAt`) are
  re-evaluated from that temperature, so energy/CO₂/water swing by
  season. `projectBaseline(b, t, { seasonal: false })` uses annual
  normals — the site-assessment verdicts and energy footprint use it so
  a placement month never biases the verdict.

## Verification

`pnpm lint` + `pnpm build`, then the headless-Chrome walkthrough in
[docs/frontend/verification.md](verification.md) (recipe from
`.claude/memory/mac-e2e-headless-chrome.md`): place an AI DC, flip its
scenario in the OPERATIONS dropdown, scrub to 2050 — expect "at
capacity (×3)" with a ×3.0 HUD note on viral, flat ×1 on steady, ×0.1
on decline; live TRACE/POWER/Ember/Aqueduct cards unchanged.

## Follow-up (not built yet): AI interpretation of the compiled data

Team decision (2026-10-03): the numbers stay algorithmic; **AI's job is
readability, not arithmetic** — turning the many raw metrics the user
sees (PUE, kt CO₂e/yr, m³/d water, MW waste heat, ranks, YoY deltas)
into plain-language explanations a non-expert can follow, so anyone can
understand what the visualization actually says at the scrubbed year.
Summaries/conclusions only — never generates the numbers themselves.
Recommended design when we build it:

- **Provider: Google Gemini API free tier** (AI Studio key) — by far the
  most generous free quota for our cadence (a summary per scrub-stop;
  flash models have historically allowed ~10 RPM / ~250 req/day, but
  Google now shows live limits only in the AI Studio dashboard — check
  before relying on exact numbers). Fallbacks: Groq free tier (fast,
  open models), OpenRouter `:free` (~50 req/day, thin for demo day).
  ChatGPT/Codex subscriptions can't be called from the app (no
  shareable key) — use them only to draft prompt templates.
- **Route: `POST /api/insights` on the Java backend** (`PowerApiServer`).
  Backend builds the prompt from the compiled projection numbers, calls
  Gemini, returns prose. Key lives in a systemd `EnvironmentFile` on the
  minipc (never in the repo/browser), CORS-safe because the frontend
  already talks to this origin.
- **Frontend**: small "AI briefing" card in the inspector summarizing
  the current year's BEFORE → AFTER; degrade to a locally-generated
  deterministic summary when the endpoint/key is missing.
