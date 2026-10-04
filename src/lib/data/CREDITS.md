# Data credits

Bundled datasets in this directory are extracted extracts of free,
open datasets. No API keys, no runtime network access. Re-extract by
downloading the upstream file (URL + date below) and filtering to the
columns kept here — see `docs/frontend/suitability.md` for the plan.

## ember-grid-intensity.csv

- **What**: grid carbon intensity, gCO₂e/kWh of electricity generated
  (total generation), per country, 2010–2024. One row per country-year.
  The `WRL` / World rows are the global aggregate (default slope +
  fallback for unknown countries).
- **Source**: Ember, Yearly Electricity Data
  (https://ember-energy.org/data/yearly-electricity-data/), downloaded
  2026-10-03 from
  `https://files.ember-energy.org/public-downloads/generation/outputs/release_generation_yearly_global.csv`
  (~104k rows upstream; filter: `Area type = Country or economy`,
  `Electricity source = Total generation`, year 2010–2024, non-empty
  `Emissions intensity (gCO2e/kWh)`; 210 countries → 3130 rows).
- **License**: CC-BY 4.0 © Ember, ember-energy.org. Attribution notice:
  "Data: Ember (2026), Yearly Electricity Data, CC-BY 4.0."

## aqueduct-water-stress.csv

- **What**: country baseline water stress ("bws"), industrial-user
  weighting (`weight = Ind`), category 0–4 + label. Category cut-offs
  are withdrawal-to-availability ratios: 0 Low (<10 %), 1 Low–Medium
  (10–20 %), 2 Medium–High (20–40 %), 3 High (40–80 %), 4 Extremely
  High (>80 %). Country-level aggregates hide regional variation
  (e.g. the US average is Low–Medium while Arizona is Extremely High).
- **Source**: WRI Aqueduct Country Rankings, table
  `aqueduct_results_v01_country_v06` (the live table behind
  https://aqueduct.wri.org/country-rankings/), queried 2026-10-03 via
  `https://wri-rw.carto.com/api/v2/sql` (189 rated countries → 162
  after dropping NoData/empty labels).
- **License**: CC-BY 4.0 © World Resources Institute, wri.org.
  Attribution notice: "Data: WRI Aqueduct (2023), CC-BY 4.0."

## ember-demand-renewables.csv

- **What**: national electricity demand (TWh) and renewable share of
  generation (%), per country (+ `WRL` world), 2010–2024.
- **Source**: same Ember Yearly Electricity Data file as above,
  downloaded 2026-10-04 (filter: `Area type = Country or economy` or
  `Area = World`; `Electricity source = Demand` → `Generation (TWh)`,
  `Electricity source = Renewables` → `Share of generation (%)`;
  3130 rows).
- **License**: CC-BY 4.0 © Ember.
