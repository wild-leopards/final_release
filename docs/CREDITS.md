# CREDITS — Sources for Model Constants, Data & Research

One place for everything the prediction model should credit: the
researched literature behind model constants, the bundled datasets
(with licenses), and the research pass that reviewed them. Companion:
`docs/frontend/formulas.md` (what each constant does and where it
lives in code), raw research output
[docs/research/formula-research1.md](research/formula-research1.md).

## Datasets the app actually loads

| Dataset | Used for | License / access | Where bundled |
|---|---|---|---|
| Ember Yearly Electricity Data (2024 release, history 2010–2024) | national grid carbon intensity + regression slope | CC-BY 4.0 — ember-energy.org/data/yearly-electricity-data | `src/data/ember-…csv`, loader `src/lib/data/datasets.ts` (`loadEmber`) — see `src/lib/data/CREDITS.md` |
| WRI Aqueduct Country Rankings | baseline water stress category 0–4 | CC-BY 4.0 — wri.org/aqueduct | `src/lib/data/` (`loadAqueduct`), `src/lib/data/CREDITS.md` |
| Climate TRACE v7 (api.climatetrace.org) | country CO₂e totals, rank, YoY change, top facilities, global total, biggest-threats layer | open attribution per trace materials | live API client `src/lib/climatetrace/api.ts` |
| NASA POWER (via our Java backend) | 30-day T2M/WS2M/RH2M/PRECTOTCORR/ELEV + ALLSKY_SFC_SW_DWN solar | public (NASA), power.larc.nasa.gov | live proxy `src/lib/power/api.ts`, backend `PowerApiServer` — API reference docs/backend/satellite-api.md |
| NASA Blue Marble day/night/topography textures | Earth skin + city lights | public (NASA Goddard) | `src/assets/textures/earth/` — see that folder's `CREDITS.md` |
| OpenStreetMap vector tiles (own PMTiles archive) | street-level map, DC facility dots | ODbL © OpenStreetMap contributors | `docs/ops/tile-build-pc.md` |

## Model constants — literature anchors

Research pass (2026-10-03, ChatGPT with web search): for each topic the
(1) accepted functional form, (2) screening constants with ranges, (3)
citation — condensed in formulas.md §6, full answer in
`docs/research/formula-research1.md`.

**PUE by cooling class** (screening defaults 1.10–1.54, ranges per
technology):

- Shehabi et al., *2024 United States Data Center Energy Usage Report*,
  LBNL-2001637 (2024) — cooling configurations, Fig 4.4.
  https://eta-publications.lbl.gov/sites/default/files/2024-12/lbnl-2024-united-states-data-center-energy-usage-report.pdf
- Lei & Masanet, 2022, *Resources, Conservation & Recycling* 182, 106323 —
  coupled PUE/WUE thermodynamic modeling by location & technology.
  https://www.sciencedirect.com/science/article/pii/S0921344922001719
- ASHRAE Handbook, Heating/Cooling (Ch. 20) — economizer operation,
  equipment envelopes (no universal PUE curve).
  https://handbook.ashrae.org/Handbooks/A23/SI/A23_Ch20/a23_ch20_si.aspx
- Uptime Institute, *2025 Annual Survey Report* — measured global
  average PUE **1.54**, flat for six years.
  https://datacenter.uptimeinstitute.com/rs/711-RIA-145/images/2025.Annual.Survey.Report.pdf
- DOE FEMP, Cooling-water efficiency opportunities for federal data
  centers — liquid-cooled hybrid facility at **PUE 1.06 / WUE 0.7**
  (proves 1.15 is not a physical PUE floor).
  https://www.energy.gov/cmei/femp/cooling-water-efficiency-opportunities-federal-data-centers

**IT-load growth** (our scenario preset rates, formulas.md §4):

- IEA, *Energy and AI* (2025) — ~12 %/yr fleet growth 2019–2024
  (415 TWh 2024 → 945 TWh 2030 outlook), 30 %/yr accelerated servers.
  https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai
- IEA, *Key Questions on Energy and AI – Executive Summary* (2026) —
  2025: all centres +17 % → 485 TWh, AI-focused **+50 %**; AI-focused
  ~triples 2025–2030 (≈24.6 %/yr CAGR, our AI default +25 %/yr).
  https://www.iea.org/reports/key-questions-on-energy-and-ai/executive-summary
- Cambridge CCAF, *Cambridge Digital Mining Industry Report* (2025) —
  Bitcoin ≈138 TWh, ≈**17 % YoY** (our crypto default +17 %/yr).
  https://www.jbs.cam.ac.uk/faculty-research/centres/alternative-finance/publications/cambridge-digital-mining-industry-report/
- IEA (2019 context), *Bitcoin energy use — mined the gap* — do not
  join methods across old/new estimates for a historical CAGR.
  https://www.iea.org/commentaries/bitcoin-energy-use-mined-the-gap
- Nature Sustainability (2025), s41893-025-01681-y — training vs
  inference allocation uncertainty (why we model ownership-neutral
  site scenarios, not workload splits).
  https://www.nature.com/articles/s41893-025-01681-y

**Water / WUE by heat-rejection technology** (0–2.0 L/kWh IT,
formulas.md §6.4):

- Mytton, 2021, *npj Clean Water* 4:106 — data-centre water use,
  onsite vs upstream distinction.
  https://www.nature.com/articles/s41545-021-00101-w
- DOE FEMP, Best Management Practice #10 Cooling Tower Management —
  makeup = evaporation + blowdown + drift; cycles of concentration 3–6.
  https://www.energy.gov/cmei/femp/best-management-practice-10-cooling-tower-management
- DOE FEMP (as above, PUE 1.06 case) — hybrid wet/dry switching.

**Grid projections — where to get scenario curves when we upgrade from
regressed slopes** (formulas.md §6.5; Ember remains the historical
baseline; note its lifecycle-CO₂e boundary):

- Ember, Yearly Electricity Data + methodology PDF (lifecycle GHG as
  CO₂e). https://ember-energy.org/data/yearly-electricity-data/ ·
  https://files.ember-energy.org/public-downloads/ember_electricity_data_methodology.pdf
- IEA, World Energy Outlook 2025 free dataset (selected country
  coverage; not every country has an NZE series).
  https://www.iea.org/data-and-statistics/data-product/world-energy-outlook-2025-free-dataset
- NGFS Scenario Explorer — open long-term scenarios, downscaled to 184
  countries. https://www.ngfs.net/ngfs-scenarios-portal/data-resources/
- NREL Cambium (US-only; hourly regional scenarios incl. **marginal
  emissions** — the right framing for "what does adding load do").
  https://www.nrel.gov/analysis/cambium.html

**Regional warming rates** (SSP2-4.5 ensemble trends, formulas.md §6.6):

- IPCC-WG1/Atlas on GitHub — `datasets-aggregated-regionally/data/
  CMIP6/CMIP6_tas_land`, SSP2-4.5 (34-model land ensemble; per-region
  OLS trends are the research file's own computation, not an
  IPCC-assessed table).
  https://github.com/IPCC-WG1/Atlas
- Iturbide et al., 2020, *ESSD* 12, 2959–3033 — the Atlas regional
  dataset + approach. https://essd.copernicus.org/articles/12/2959/2020/
- World Bank Climate Change Knowledge Portal — downscaled CMIP6
  (site-local alternative).
  https://climateknowledgeportal.worldbank.org/download-data ·
  https://datacatalog.worldbank.org/infrastructure-data/search/dataset/0042297

**Captain's feedback loop (emissions → temperature):**

- IPCC AR6 WG1 SPM — quasi-linear TCRE: each **1000 GtCO₂** cumulative
  CO₂ ≈ **+0.45 °C** (0.27–0.63). The citable constant if a future pass
  couples the fleet totals into the temperature drift
  (formulas.md §6.8). https://www.ipcc.ch/report/ar6/wg1/

## Desktop research notes

- Keep published values distinct from our labeled **screening
  defaults** — nothing in the model should pretend to be a measured
  industry distribution (research file's opening line).
- If probabilistic load behaviour is ever added, fit a documented
  distribution to comparable sites; yearly re-drawn growth rates would
  be false statistical precision.
- Heat: an electricity-only facility's total heat ≈ its electricity
  consumption (research file §6; DOE heat-balance basis) — our waste-
  heat formula underestimates until corrected (formulas.md §6.7).
