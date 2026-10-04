import type { LatLon } from './geo';
import {
  TRACE_DATA_YEAR,
  findCountryRanking,
  fetchTopSources,
  type CountryRanking,
  type RankedSource,
} from './climatetrace/api';
import { nearestCountry } from './climatetrace/countryCentroids';
import {
  emberByIso3,
  emberEnergyByIso3,
  emberSlopePctPerYear,
  waterStressByIso3,
} from './data/datasets';
import { fetchClimatology, fetchSolar, fetchWeather } from './power/api';

/**
 * First-version environmental impact model.
 *
 * The placement heuristics (PUE, water, heat) are still deterministic
 * estimates — but the REGIONAL EMISSIONS baseline now comes from real
 * Climate TRACE satellite-derived data (api.climatetrace.org, v7):
 * country-level CO₂e totals, global rank, YoY change and the country's
 * top-emitting facilities. `baseline.dataSource` records which numbers
 * are live and which are heuristic.
 */

// ── Data model ─────────────────────────────────────────────────────

/** Monthly long-term climate normals of a site (NASA POWER
 *  climatology): index 0 = January. */
export interface SiteClimatology {
  tempC: number[];
  solarKwhM2Day: number[];
  windMs: number[];
  annualTempC: number;
  annualSolarKwhM2Day: number;
  annualWindMs: number;
}

/** Description of the region around a placement site. Starts as
 *  synthetic heuristics, then real datasets overwrite fields — each
 *  `…Source` field records which. */
export interface RegionBaseline {
  /** Annual mean temperature; seasonal month value after projection. */
  meanTempC: number;
  renewableSharePct: number; // grid renewable share
  /** 'ember' = real generation share, else derived/heuristic. */
  renewableSource?: 'ember' | 'heuristic';
  /** Ember 10-year renewable-share trend, pp/yr. */
  renewableSlopePpPerYear?: number;
  waterStressIndex: number; // synthetic 0–100 fallback (no Aqueduct)
  regionalCo2KtPerYear: number; // existing annual emissions
  regionalEnergyGwhPerYear: number; // existing annual consumption
  /** 'ember' = real national electricity demand, else heuristic. */
  energySource?: 'ember' | 'heuristic';
  energyDataYear?: number;
  /** Ember demand trend, %/yr. */
  demandSlopePctPerYear?: number;
  /** NASA POWER monthly climate normals (seasonality source). */
  climatology?: SiteClimatology;

  // ── Climate TRACE (real data) ───────────────────────────────────
  /** 'climatetrace' once real country data is attached, else 'heuristic'. */
  dataSource: 'climatetrace' | 'heuristic';
  countryIso3?: string;
  countryName?: string;
  /** Global emissions rank of the country (1 = largest emitter). */
  countryRank?: number;
  /** Country's share of global emissions, 0–100. */
  countrySharePct?: number;
  /** Country year-over-year emissions change, percent. */
  countryChangePct?: number;
  /** Per-capita country emissions, tonnes CO₂e per person. */
  countryPerCapitaT?: number;
  /** Climate TRACE data year the numbers refer to. */
  dataYear?: number;

  // ── NASA POWER (real satellite data, via the backend) ───────────
  /** 'nasa-power' once real satellite weather/solar is attached. */
  climateDataSource?: 'nasa-power' | 'heuristic';
  /** Mean daily solar irradiation, kWh/m²/day: long-term annual mean
   *  when climatology attached, else the 30-day mean. */
  solarAvgKwhM2Day?: number;
  /** Mean 2 m wind speed, m/s (annual normal or 30-day). */
  windMs?: number;
  /** 30-day mean relative humidity, %. */
  humidityPct?: number;
  /** 30-day mean precipitation, mm/day. */
  precipMmDay?: number;
  /** Site elevation, m (POWER grid cell, from the response geometry). */
  elevationM?: number;

  // ── Ember + WRI Aqueduct (bundled real country data) ────────────
  /** Grid carbon intensity, gCO₂e/kWh (Ember, latest year ≤ 2024). */
  gridIntensityG?: number;
  gridIntensityYear?: number;
  /** True when gridIntensityG is a timeline projection (not the raw
   *  Ember measurement) — verdicts word the source accordingly. */
  gridProjected?: boolean;
  /** Extrapolated trend of the intensity history, %/yr (clamped ±6). */
  gridSlopePctPerYear?: number;
  /** Whether the slope is the country's own history or the world default. */
  gridSlopeSource?: 'ember' | 'world';
  /** Aqueduct baseline water stress category 0 (low) … 4 (extremely high). */
  waterStressCat?: 0 | 1 | 2 | 3 | 4;
  waterStressLabel?: string;
}

/** Estimated footprint of one placed data center. */
export interface ImpactEstimate {
  capacityMw: number; // nameplate IT load (design capacity)
  /** Actual IT load at the target year (nameplate × demand scenario ×
   *  ramp); equals capacityMw in the placement snapshot. */
  itLoadMw: number;
  pue: number; // power usage effectiveness
  annualEnergyGwh: number;
  co2KtPerYear: number; // added emissions, depends on grid mix
  waterM3PerDay: number; // cooling water demand
  heatWasteMw: number; // waste heat rejected
  renewableCoveragePct: number; // share of added load from renewables
}

/** A data center placed by the user; snapshot of when it was created. */
export interface PlacedMarker {
  id: string;
  name: string;
  kind: MarkerKind;
  lat: number;
  lon: number;
  /** Timeline year the facility was placed (construction starts then). */
  placedYear: number;
  /** How the facility's load evolves after the ramp (demand scenario). */
  operations: OperationsProfile;
  baseline: RegionBaseline;
  impact: ImpactEstimate;
}

// ── Placable object types ──────────────────────────────────────────

export type PresetMarkerKind =
  | 'data-center'
  | 'ai-data-center'
  | 'factory'
  | 'crypto-farm';

/** User-defined facilities get a unique `custom-…` id at creation. */
export type MarkerKind = PresetMarkerKind | `custom-${string}`;

/** Everything the UI needs to present one kind of placeable object. */
export interface MarkerKindConfig {
  kind: MarkerKind;
  label: string; // human-readable name, used in generated marker names
  spec: string; // one-line spec shown in the type picker
  accent: string; // accent hue for picker/inspector chrome
  capacityMw: number; // typical IT load
  pueBias: number; // cooling/overhead bias added to base PUE
}

export const MARKER_KINDS: readonly MarkerKindConfig[] = [
  {
    kind: 'data-center',
    label: 'Data Center',
    spec: '~30 MW · general compute',
    accent: '#42d7e8',
    capacityMw: 30,
    pueBias: 0,
  },
  {
    kind: 'ai-data-center',
    label: 'AI Data Center',
    spec: '~80 MW · dense GPU racks',
    accent: '#b18cff',
    capacityMw: 80,
    pueBias: 0.15,
  },
  {
    kind: 'factory',
    label: 'Factory',
    spec: '~12 MW · industrial load',
    accent: '#f0a35e',
    capacityMw: 12,
    pueBias: -0.1,
  },
  {
    kind: 'crypto-farm',
    label: 'Crypto Mining Farm',
    spec: '~45 MW · round-the-clock',
    accent: '#7ddba3',
    capacityMw: 45,
    pueBias: 0.08,
  },
];

const KIND_CONFIG_MAP = Object.fromEntries(
  MARKER_KINDS.map((cfg) => [cfg.kind, cfg]),
) as Record<PresetMarkerKind, MarkerKindConfig>;

/** User-defined kinds, registered here at creation time so every
 *  resolver (impact estimate, suitability outlook, street-map dot
 *  color) sees the real capacity/accent — not the data-center preset
 *  the naive fallback would hand out for `custom-…` ids. */
const CUSTOM_KINDS = new Map<string, MarkerKindConfig>();

/** Make a user-defined kind resolvable everywhere. */
export function registerCustomKind(cfg: MarkerKindConfig): void {
  CUSTOM_KINDS.set(cfg.kind, cfg);
}

/** Config for any kind: custom kinds win, then the preset map, then
 *  the data-center preset as a last resort for unknown ids. */
export function getMarkerKindConfig(kind: MarkerKind): MarkerKindConfig {
  return (
    CUSTOM_KINDS.get(kind) ??
    KIND_CONFIG_MAP[kind as PresetMarkerKind] ??
    KIND_CONFIG_MAP['data-center']
  );
}

// ── Operations / demand scenarios ──────────────────────────────────

/** How a facility's load evolves after the construction ramp:
 *  steady = flat demand, growth = compounding demand, viral = worst-case
 *  blow-up hitting the capacity limit, decline = shrinking demand. */
export type OperationsScenario = 'steady' | 'growth' | 'viral' | 'decline';

/** Per-facility demand-growth setting (editable in the inspector). */
export interface OperationsProfile {
  scenario: OperationsScenario;
  /** Annual demand growth, %/yr (negative = decline). */
  annualDemandGrowthPct: number;
}

/** Scenario presets — the rate the inspector applies when a scenario is
 *  picked (growth rates researched against published projections, see
 *  docs/CREDITS.md): 9 %/yr ≈ IEA conventional-server outlook proxy,
 *  35 %/yr ≈ the honest AI worst case (IEA AI-focused centers grew ~50 %
 *  in 2025 and triple 2025–2030), −10 %/yr for a demand collapse. */
export const OPERATIONS_SCENARIOS: Record<
  OperationsScenario,
  { label: string; growthPctPerYear: number }
> = {
  steady: { label: 'Steady', growthPctPerYear: 0 },
  growth: { label: 'Growth', growthPctPerYear: 9 },
  viral: { label: 'Viral demand', growthPctPerYear: 35 },
  decline: { label: 'Decline', growthPctPerYear: -10 },
};

/** Operations profile a marker starts with, per its kind: AI campuses
 *  compound fastest (IEA 2026 update: AI-focused electricity roughly
 *  triples 2025–2030 → ~25 %/yr CAGR), crypto follows its own observed
 *  boom (Cambridge CCAF 2025: ~17 % YoY), everything else runs flat
 *  until the user picks a scenario. */
export function defaultOperationsForKind(kind: MarkerKind): OperationsProfile {
  if (kind === 'ai-data-center') {
    return { scenario: 'growth', annualDemandGrowthPct: 25 };
  }
  if (kind === 'crypto-farm') {
    return { scenario: 'growth', annualDemandGrowthPct: 17 };
  }
  return { scenario: 'steady', annualDemandGrowthPct: 0 };
}

// ── Deterministic pseudo-random from coordinates ───────────────────

/** Stable hash of a location -> 0..1. Same spot always yields the same
 *  pseudo-random values, so markers keep their numbers across renders. */
function locationNoise(lat: number, lon: number, salt: number): number {
  const x = Math.sin(lat * 12.9898 + lon * 78.233 + salt * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

/** Baseline environmental profile of a site, before anything is built. */
export function getRegionBaseline({ lat, lon }: LatLon): RegionBaseline {
  return {
    meanTempC: 28 - Math.abs(lat) * 0.5 + locationNoise(lat, lon, 1) * 4 - 2,
    renewableSharePct: 15 + locationNoise(lat, lon, 2) * 60,
    renewableSource: 'heuristic',
    energySource: 'heuristic',
    waterStressIndex: locationNoise(lat, lon, 4) * 100,
    regionalCo2KtPerYear: 150 + locationNoise(lat, lon, 5) * 700,
    regionalEnergyGwhPerYear: 400 + locationNoise(lat, lon, 6) * 1600,
    dataSource: 'heuristic',
  };
}

/** Grid carbon intensity for a renewable share: dirty grid ~750 gCO2/kWh,
 *  clean grid ~45 gCO2/kWh, linear in between. Shared by the placement
 *  estimate and the timeline projection so both stay consistent. */
export function gridIntensityOf(renewableSharePct: number): number {
  return (
    750 * (1 - renewableSharePct / 100) +
    45 * (renewableSharePct / 100)
  );
}

/** Inverse of gridIntensityOf: what renewable share a real measured
 *  intensity corresponds to, so the UI's "% renewable grid" keeps
 *  meaning the same thing once real Ember data replaces the heuristic. */
export function shareFromIntensity(gridIntensityG: number): number {
  return Math.max(0, Math.min(100, ((750 - gridIntensityG) / (750 - 45)) * 100));
}

/** Grid intensity a baseline actually carries: the real Ember number
 *  when it has been attached, the heuristic mapping otherwise. Shared
 *  by estimateImpact, projectImpact and the suitability verdicts. */
export function effectiveGridIntensity(
  baseline: Pick<RegionBaseline, 'renewableSharePct' | 'gridIntensityG'>,
): number {
  return baseline.gridIntensityG ?? gridIntensityOf(baseline.renewableSharePct);
}

/** Attach the bundled real country data (Ember grid intensity + WRI
 *  Aqueduct water stress) to a baseline. Local and synchronous, so
 *  every placed marker gets real grid/water numbers instantly, even
 *  offline — network enrichment (TRACE, POWER) only refines them. */
function attachLocalCountryData(baseline: RegionBaseline, lat: number, lon: number): RegionBaseline {
  const iso3 = nearestCountry(lat, lon);
  if (!iso3) return baseline;

  const next: RegionBaseline = { ...baseline };
  const ember = emberByIso3.get(iso3);
  if (ember) {
    const { slopePctPerYear, source } = emberSlopePctPerYear(iso3);
    next.gridIntensityG = ember.latestG;
    next.gridIntensityYear = ember.latestYear;
    next.gridSlopePctPerYear = slopePctPerYear;
    next.gridSlopeSource = source;
    // Keep the displayed renewable share consistent with the real grid
    // (overwritten by the real Ember share just below when available).
    next.renewableSharePct = shareFromIntensity(ember.latestG);
  }
  const energy = emberEnergyByIso3.get(iso3);
  if (energy) {
    next.regionalEnergyGwhPerYear = energy.demandTwh * 1000;
    next.energySource = 'ember';
    next.energyDataYear = energy.latestYear;
    next.demandSlopePctPerYear = energy.demandSlopePctPerYear;
    next.renewableSharePct = energy.renewablePct;
    next.renewableSource = 'ember';
    next.renewableSlopePpPerYear = energy.renewableSlopePpPerYear;
  }
  const water = waterStressByIso3.get(iso3);
  if (water) {
    next.waterStressCat = water.cat;
    next.waterStressLabel = water.label;
  }
  return next;
}

/** PUE model (synthetic assumption): 1.2 baseline, +0.005 per °C above
 *  15 °C (costlier cooling), plus the kind's overhead bias. */
export function pueAt(tempC: number, kind: MarkerKind): number {
  return 1.2 + Math.max(0, tempC - 15) * 0.005 + getMarkerKindConfig(kind).pueBias;
}

/** Water-usage effectiveness assumption, L/kWh: evaporative cooling
 *  rises linearly from 0.9 L/kWh at ≤5 °C to 1.9 L/kWh at ≥20 °C
 *  (published fleet averages are ~1.8 L/kWh). */
export function wueAt(tempC: number): number {
  return 0.9 + Math.min(1, Math.max(0, (tempC - 5) / 15)) * 1.0;
}

/** Estimated footprint of one placed object, per its kind. */
export function estimateImpact(baseline: RegionBaseline, kind: MarkerKind): ImpactEstimate {
  const cfg = getMarkerKindConfig(kind);
  const capacityMw = cfg.capacityMw;
  const pue = pueAt(baseline.meanTempC, kind);
  const annualEnergyGwh = capacityMw * pue * 8.76; // MW * h -> GWh over a year

  const gridIntensity = effectiveGridIntensity(baseline);
  const co2KtPerYear = (annualEnergyGwh * 1e6 * gridIntensity) / 1e9;

  const waterM3PerDay = (annualEnergyGwh * 1e6 * wueAt(baseline.meanTempC)) / 365 / 1000;

  return {
    capacityMw,
    itLoadMw: capacityMw, // placement snapshot: nameplate, pre-growth
    pue,
    annualEnergyGwh,
    co2KtPerYear,
    waterM3PerDay,
    heatWasteMw: capacityMw * (pue - 1),
    renewableCoveragePct: baseline.renewableSharePct,
  };
}

/** Create a full marker (baseline + impact snapshot) for a clicked site.
 *  `placedYear` is the timeline year the user placed it in — construction
 *  (and the projection ramp) starts then. */
export function createMarker(
  id: string,
  name: string,
  kind: MarkerKind,
  latLon: LatLon,
  placedYear: number,
): PlacedMarker {
  const baseline = attachLocalCountryData(getRegionBaseline(latLon), latLon.lat, latLon.lon);
  return {
    id,
    name,
    kind,
    lat: latLon.lat,
    lon: latLon.lon,
    placedYear,
    operations: defaultOperationsForKind(kind),
    baseline,
    impact: estimateImpact(baseline, kind),
  };
}

// ── Climate TRACE live-data enrichment ────────────────────────────

/** Real, asset-level context for a placed site: the country's top
 *  emitting facilities according to Climate TRACE. */
export interface MarkerTraceContext {
  /** Top facilities, largest first. */
  topSources: TraceFacility[];
  status: 'ready' | 'unavailable';
}

export interface TraceFacility {
  id: string;
  name: string;
  sector?: string;
  subsector?: string;
  /** Tonnes CO₂e for the data year. */
  emissionsT: number;
}

/** Read the numeric emissions value out of a `/v7/sources` row, whose
 *  field naming has shifted between API versions. */
function sourceEmissions(src: RankedSource): number {
  const v =
    (typeof src.emissionsQuantity === 'number' ? src.emissionsQuantity : undefined) ??
    (typeof src.emissions === 'number' ? src.emissions : undefined) ??
    (typeof src.emissionsQuantity === 'string'
      ? parseFloat(src.emissionsQuantity as string)
      : undefined) ??
    0;
  return Number.isFinite(v) ? v : 0;
}

function sourceName(src: RankedSource, index: number): string {
  return (
    (src.name as string | undefined) ??
    (src.sourceName as string | undefined) ??
    (typeof src.source_id !== 'undefined' ? `Asset #${src.source_id}` : `Asset ${index + 1}`)
  );
}

function sourceId(src: RankedSource, index: number): string {
  const v =
    src.sourceId ??
    src.source_id ??
    (src as { id?: unknown }).id;
  return v !== undefined ? String(v) : `idx-${index}`;
}

/**
 * Attach real Climate TRACE data to a freshly placed marker.
 *
 * Resolves the clicked lat/lon to the nearest country, then pulls that
 * country's verified CO₂e totals for the data year and its top emitting
 * facilities. When anything fails the marker keeps its heuristic
 * baseline — the UI degrades gracefully instead of breaking placement.
 *
 * Returns `{ marker, context }`; on failure returns the input untouched
 * with `context.status = 'unavailable'`.
 */
export async function enrichMarkerWithClimateTrace(
  marker: PlacedMarker,
): Promise<{ marker: PlacedMarker; context: MarkerTraceContext }> {
  const unavailable: MarkerTraceContext = { topSources: [], status: 'unavailable' };
  try {
    const iso3 = nearestCountry(marker.lat, marker.lon);
    if (!iso3) return { marker, context: unavailable };

    const ranking: CountryRanking | null = await findCountryRanking(iso3, TRACE_DATA_YEAR);
    if (!ranking) return { marker, context: unavailable };

    // Real country emissions -> kt/yr for the baseline BEFORE value.
    const regionalCo2KtPerYear = ranking.emissionsQuantity / 1e3;
    const baseline: RegionBaseline = {
      ...marker.baseline,
      dataSource: 'climatetrace',
      countryIso3: iso3,
      countryName: ranking.name,
      countryRank: ranking.rank,
      countrySharePct: ranking.percentage,
      countryChangePct: ranking.emissionsPercentChange,
      countryPerCapitaT: ranking.emissionsPerCapita,
      dataYear: TRACE_DATA_YEAR,
      // Forest-sink countries can report negative totals; clamp at 0 so
      // the UI's BEFORE/AFTER math stays sensible.
      regionalCo2KtPerYear: Math.max(0, regionalCo2KtPerYear),
    };

    const updated: PlacedMarker = { ...marker, baseline };

    // Best-effort: top real facilities in the same country.
    let context: MarkerTraceContext = { topSources: [], status: 'unavailable' };
    try {
      const rows = await fetchTopSources(iso3, TRACE_DATA_YEAR, 5);
      context = {
        status: rows.length > 0 ? 'ready' : 'unavailable',
        topSources: rows.map((src, i) => ({
          id: sourceId(src, i),
          name: sourceName(src, i),
          sector: src.sector,
          subsector: src.subsector,
          emissionsT: sourceEmissions(src),
        })),
      };
    } catch {
      // sources endpoint hiccup: rankings already attached, keep going
    }

    return { marker: updated, context };
  } catch {
    return { marker, context: unavailable };
  }
}

// ── NASA POWER live-data enrichment ───────────────────────────────

/**
 * Attach real NASA POWER satellite data to a freshly placed marker.
 *
 * Pulls the last 30 days of 2 m air temperature, wind (WS2M), humidity
 * (RH2M), precipitation (PRECTOTCORR), elevation (ELEV, served by the
 * backend from the response geometry) and all-sky solar irradiation.
 * The real mean temperature replaces the heuristic one and the impact
 * estimate is recomputed — PUE and cooling water both depend on it —
 * plus the site's solar/wind/water-air data feeds the suitability
 * verdicts. On any failure the marker is returned untouched, keeping
 * the heuristic numbers (same degradation contract as Climate TRACE).
 */
export async function enrichMarkerWithPower(marker: PlacedMarker): Promise<PlacedMarker> {
  try {
    const [weather, solar, clim] = await Promise.all([
      fetchWeather(marker.lat, marker.lon, 'T2M,WS2M,RH2M,PRECTOTCORR,ELEV'),
      fetchSolar(marker.lat, marker.lon),
      // Climatology is optional: older backends lack the endpoint.
      fetchClimatology(marker.lat, marker.lon).catch(() => null),
    ]);
    const t = clim?.parameters.T2M;
    const sw = clim?.parameters.ALLSKY_SFC_SW_DWN;
    const ws = clim?.parameters.WS2M;
    const climatology: SiteClimatology | undefined =
      t && sw && ws && t.monthly.length === 12 && sw.monthly.length === 12 && ws.monthly.length === 12
        ? {
            tempC: t.monthly,
            solarKwhM2Day: sw.monthly,
            windMs: ws.monthly,
            annualTempC: t.annual,
            annualSolarKwhM2Day: sw.annual,
            annualWindMs: ws.annual,
          }
        : undefined;

    const meanOf = (name: string): number | undefined => {
      const values = Object.values(weather.parameters[name] ?? {});
      return values.length > 0
        ? values.reduce((sum, v) => sum + v, 0) / values.length
        : undefined;
    };

    const realMeanTempC = meanOf('T2M');
    const windMs = meanOf('WS2M');
    const humidityPct = meanOf('RH2M');
    const precipMmDay = meanOf('PRECTOTCORR');
    const elevationM = meanOf('ELEV');

    const baseline: RegionBaseline = {
      ...marker.baseline,
      climateDataSource: 'nasa-power',
      ...(realMeanTempC !== undefined && { meanTempC: realMeanTempC }),
      ...(windMs !== undefined && { windMs }),
      // Long-term annual normals beat a 30-day window (season bias).
      ...(climatology && {
        climatology,
        meanTempC: climatology.annualTempC,
        windMs: climatology.annualWindMs,
      }),
      ...(humidityPct !== undefined && { humidityPct }),
      ...(precipMmDay !== undefined && { precipMmDay }),
      ...(elevationM !== undefined && { elevationM }),
      solarAvgKwhM2Day: climatology?.annualSolarKwhM2Day ?? solar.stats.avg,
    };

    return { ...marker, baseline, impact: estimateImpact(baseline, marker.kind) };
  } catch {
    return marker;
  }
}
