# Handoff — Prediction Upgrade & Docs Overhaul (status: BUILT 2026-10-03)

All three work packages were executed in the 2026-10-03 session — this
doc is now the record of what was planned and the decisions taken; the
built model reads `docs/frontend/formulas.md` (§3–§4 equations, §6
research folding) and `docs/frontend/projection.md`. Keep for the next
handoff of this kind; copy-paste prompt at the bottom is historic.

Original context docs to read first: `docs/frontend/formulas.md` (the
current formula catalog), `docs/frontend/projection.md`,
`docs/frontend/suitability.md`.

## Work package 1 — Demand/operations scenarios — ✅ BUILT

Implemented as planned, with these decisions:

- **Scenario UX**: per-facility dropdown in the inspector's OPERATIONS
  card (steady / growth / viral / decline, each shipping its preset
  rate). No global toggle, nothing in the marker popup (inspector has
  the room; popup stays Relocate/Remove).
- **Load factor**: `demand(Y) = clamp((1+g/100)^(Y−Yp), 0.05…3)` in
  `projection.ts` → `demandFactor`; ×3 = physical plant limit, growth
  flattens at the cap; downstream energy/CO₂/water/heat all scale.
- **Kind defaults** (researched — see docs/CREDITS.md): AI DC +25 %/yr
  growth (IEA AI-focused tripling 2025–2030), crypto +17 %/yr
  (Cambridge CCAF 2025 YoY), data center + factory + custom steady.
- **HUD/inspector visibility**: inspector lifecycle line shows
  "Operational · demand ×N nameplate" / "… · at capacity (×3)"; HUD
  "Active IT Load" card sums actual load with a "×N nameplate from
  demand growth" note. Verification evidence in formulas.md end +
  docs/frontend/verification.md (headless-Chrome walkthrough).
- **Enrichment race hardened**: in-flight TRACE/POWER responses no
  longer clobber a scenario edit (App.enrich merges, keeping
  `operations`).
- **Co-location severity + capacity-expansion events**: deliberately
  NOT built (open questions below → answered as out of scope for now;
  the ×3 cap is the expansion stand-in).

## Work package 2 — Research pass over the constants — ✅ FOLDED

The ChatGPT research answer is committed verbatim at
`docs/research/formula-research1.md`; distilled citations live in
`docs/CREDITS.md`, the updated values/functional forms + what remains
unimplemented are in `docs/frontend/formulas.md` §6 (PUE-by-cooling
curves, IT-load growth anchors — these *did* ship as the WP1 scenario
rates, WUE-by-technology table, grid scenario-curve sources, SSP2-4.5
regional warming, and the flagged physical corrections). No numeric
model constants were changed without public backing; the flagged
corrections (waste-heat formula, WUE denominator, PUE floors/scenario
curves) are documented as next steps, not silently changed.

## Work package 3 — Docs overhaul — ✅ BUILT

- `docs/frontend/verification.md` (new): per-feature matrix — what /
  how / where-computed / data-source / how-to-verify, in formulas.md
  style, incl. the headless-Chrome E2E recipe and the demand-scenario
  checks.
- `docs/frontend/frontend.md` refreshed (feature list + docs pointers,
  stale "+1.5 pp/yr" projection wording corrected).
- `docs/CREDITS.md` (new) + README's Documentation Index updated.
- `.claude/memory` convention untouched (recipes stay in-repo and
  committed).

## Open questions (decided 2026-10-03)

- Scenario UX: ~~dropdown vs global toggle vs both~~ → per-facility
  dropdown in the inspector.
- "Viral" raising co-location severity → not built; revisit when the
  threat layer gains per-year logic.
- Capacity-expansion events → out of scope; `DEMAND_FACTOR_MAX = 3`
  (projection.ts) is the deliberate stand-in — a future event system
  would only raise that limit per marker.

## Session prompt (copy-paste)

> Read AGENTS.md, CLAUDE.md, docs/frontend/formulas.md,
> docs/frontend/projection.md and docs/frontend/suitability.md first.
> Two jobs, in this order:
>
> 1. **Demand/operations scenarios**: add per-facility demand growth to
>    the timeline projection as sketched in docs/handoff-prediction.md
>    (Work package 1) — a load factor in projectImpact, defaults per
>    marker kind, editable scenario on the marker, visible in HUD/
>    inspector, monkey-bar keep lint+build green, verify with the
>    headless-Chrome recipe in .claude/memory/mac-e2e-headless-chrome.md.
>    Update formulas.md with the new equations.
>
> 2. **Docs overhaul** per Work package 3: cover every feature with
>    what/how/where-computed/data-source sections in the style of
>    formulas.md; update README's docs index; keep the memory
>    convention (.claude/memory committed).
>
> If a ChatGPT research answer with citations is available for the
> constants (Work package 2), fold the updated values + citations into
> formulas.md and a CREDITS file instead of inventing numbers.

## ChatGPT research prompt (copy-paste, web search on)

> You are helping an educational climate/energy hackathon project make
> its deterministic prediction model more accurate and citable. Our
> model projects a data center's yearly energy, CO₂, cooling water and
> waste heat from 2026 to 2050, per site, using: real national grid
> carbon intensity (Ember 2024) projected along each country's own
> 2010–2024 regression slope (clamped ±6 %/yr, rising trends
> decelerating after 2040, floor 20 / ceiling 1000 gCO₂/kWh); PUE =
> 1.2 + max(0, T−15°C)·0.005 improving 0.005/yr (floor 1.15); energy =
> IT MW · PUE · 8760 h; CO₂ = energy × grid intensity; cooling water =
> 1.9 L/kWh above 10 °C mean ambient else 0.9; waste heat =
> IT MW · (PUE−1); +0.03 °C/yr warming drift. Please research with
> citations (IEA, Uptime Institute, ASHRAE, Ember, IPCC SSP, peer-
> reviewed DC energy studies) and return for each: (1) the accepted
> formula/functional form, (2) recommended constant values with
> ranges, (3) one-line citation. Specifically: PUE vs ambient
> temperature curves by cooling class; realistic annual IT-load growth
> distributions for AI-training vs inference vs general colo vs crypto
> (2019–2025 observed + official projections to 2030/2050); WUE
> (L/kWh) by cooling technology (adiabatic, chilled-water, direct
> evaporative, immersion); whether country grid-intensity projections
> should use published scenario curves (Ember/NZE/STEPS) rather than
> regressed historical slopes, and where to get per-country values;
> regional warming rates per decade under SSP2-4.5. Also flag anything
> in our model that is physically wrong or misleading. Format: a table
> per topic, then a "suggested updated model" summary.
