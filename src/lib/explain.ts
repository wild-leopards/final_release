import type { MarkerKindConfig, PlacedMarker, RegionBaseline } from './simulation';
import { effectiveGridIntensity } from './simulation';
import {
  TIMELINE_START_YEAR,
  formatMonth,
  isoMonth,
  projectBaseline,
  projectImpact,
} from './projection';
import { siteSuitability } from './suitability';
import { BACKEND_BASE } from './power/api';

/**
 * One source of truth for the numbers the inspector shows for a placed
 * facility at a timeline month, each tagged with its provenance and a
 * one-line formula. The inspector renders from it and the AI explain
 * snapshot serializes it — so the AI only ever sees exactly what the
 * user sees.
 */

/** REAL = measured/published dataset; DERIVED = formula over real
 *  inputs or interpolation between real data points; SYNTHETIC =
 *  model assumption. */
export type Provenance = 'REAL' | 'DERIVED' | 'SYNTHETIC';

export interface ViewMetric {
  key: string;
  label: string;
  unit: string;
  value: number;
  provenance: Provenance;
  /** Real dataset behind the value (REAL/DERIVED), e.g. "Ember". */
  source?: string;
  formula: string;
}

/** Site energy-footprint constants (documented assumptions). */
const PV_MWP_PER_KM2 = 200;
const PV_PERFORMANCE_RATIO = 0.8;
const TURBINE_MW = 5;
/** Hellmann exponent: 2 m wind → 100 m hub height. */
const WIND_SHEAR_ALPHA = 0.143;
const FALLBACK_SOLAR_KWH = 4.5;
const FALLBACK_WIND_CF = 0.35;

/** Rough turbine capacity factor from hub-height mean wind speed
 *  (linear fit of typical 5 MW power curves, 6 m/s ≈ 24 %, 8 m/s ≈ 37 %). */
function windCapacityFactor(v100: number): number {
  return Math.min(0.5, Math.max(0.05, 0.065 * v100 - 0.15));
}

export interface Footprint {
  solarKwhM2Day: number;
  solarReal: boolean;
  windCf: number;
  windReal: boolean;
  windTurbines: number;
  solarKm2: number;
  /** Days of a 100 MWp solar farm's output per day of facility use. */
  solarDaysPerDay: number;
}

/** What it takes to cover a yearly demand with renewables at this site
 *  (annual normals, not the scrubbed month). */
export function footprintFor(annualGwh: number, baseline: RegionBaseline): Footprint {
  const clim = baseline.climatology;
  const solarReal = clim !== undefined || baseline.solarAvgKwhM2Day !== undefined;
  const solar = clim?.annualSolarKwhM2Day ?? baseline.solarAvgKwhM2Day ?? FALLBACK_SOLAR_KWH;
  const wind2 = clim?.annualWindMs ?? baseline.windMs;
  const windReal = wind2 !== undefined;
  const windCf =
    wind2 !== undefined ? windCapacityFactor(wind2 * (100 / 2) ** WIND_SHEAR_ALPHA) : FALLBACK_WIND_CF;
  const turbineGwh = TURBINE_MW * windCf * 8.76;
  // MWp × kWh/kWp·day (= irradiance × PR) × 365 → GWh/yr per km².
  const pvGwhPerKm2 = (PV_MWP_PER_KM2 * solar * PV_PERFORMANCE_RATIO * 365) / 1000;
  const farmGwhPerDay = (100 * solar * PV_PERFORMANCE_RATIO) / 1000;
  return {
    solarKwhM2Day: solar,
    solarReal,
    windCf,
    windReal,
    windTurbines: Math.ceil(annualGwh / turbineGwh),
    solarKm2: annualGwh / pvGwhPerKm2,
    solarDaysPerDay: annualGwh / 365 / farmGwhPerDay,
  };
}

export interface MarkerView {
  /** Seasonal projection (weather = the month's normal). */
  baseline: RegionBaseline;
  /** Annual-normal projection (suitability verdicts). */
  annualBaseline: RegionBaseline;
  impact: ReturnType<typeof projectImpact>;
  assessment: ReturnType<typeof siteSuitability>;
  footprint: Footprint;
  metrics: ViewMetric[];
}

/** Everything the inspector shows for a marker at fractional year t. */
export function buildMarkerView(marker: PlacedMarker, t: number): MarkerView {
  const raw = marker.baseline;
  const baseline = projectBaseline(raw, t);
  const annualBaseline = projectBaseline(raw, t, { seasonal: false });
  const impact = projectImpact(marker, t);
  const assessment = siteSuitability(annualBaseline, marker.kind);
  const footprint = footprintFor(impact.annualEnergyGwh, annualBaseline);
  const projected = t > TIMELINE_START_YEAR;
  /** REAL at the start, DERIVED once a trend carries it forward. */
  const realOrTrend = (real: boolean): Provenance =>
    real ? (projected ? 'DERIVED' : 'REAL') : 'SYNTHETIC';
  const tempReal = raw.climateDataSource === 'nasa-power';
  const gridReal = raw.gridIntensityG !== undefined;

  const metrics: ViewMetric[] = [
    {
      key: 'siteTempC',
      label: raw.climatology ? 'Site temperature (monthly normal)' : 'Site temperature',
      unit: '°C',
      value: baseline.meanTempC,
      provenance: raw.climatology ? (projected ? 'DERIVED' : 'REAL') : tempReal ? 'REAL' : 'SYNTHETIC',
      source: tempReal ? 'NASA POWER' : undefined,
      formula: raw.climatology
        ? 'Long-term NASA POWER mean for this calendar month + 0.03 °C/yr assumed warming'
        : 'Recent 30-day mean (or latitude heuristic) + 0.03 °C/yr assumed warming',
    },
    {
      key: 'gridIntensity',
      label: 'Grid carbon intensity',
      unit: 'gCO₂e/kWh',
      value: effectiveGridIntensity(baseline),
      provenance: realOrTrend(gridReal),
      source: gridReal ? 'Ember' : undefined,
      formula: gridReal
        ? `Ember ${raw.gridIntensityYear} national value, compounded along its 2010–2024 trend (${raw.gridSlopePctPerYear?.toFixed(1)} %/yr), monthly interpolated`
        : 'Linear map from an estimated renewable share',
    },
    {
      key: 'renewableShare',
      label: 'Renewable share of grid',
      unit: '%',
      value: baseline.renewableSharePct,
      provenance: realOrTrend(raw.renewableSource === 'ember'),
      source: raw.renewableSource === 'ember' ? 'Ember' : undefined,
      formula:
        raw.renewableSource === 'ember'
          ? `Ember ${raw.energyDataYear} share + its 10-year trend (${raw.renewableSlopePpPerYear?.toFixed(1)} pp/yr)`
          : 'Heuristic estimate',
    },
    {
      key: 'itLoadMw',
      label: 'Facility IT load',
      unit: 'MW',
      value: impact.itLoadMw,
      provenance: 'SYNTHETIC',
      formula: `Assumed nameplate ${impact.capacityMw} MW × construction ramp × demand scenario (${marker.operations.annualDemandGrowthPct} %/yr, capped ×3)`,
    },
    {
      key: 'pue',
      label: 'PUE (power usage effectiveness)',
      unit: '',
      value: impact.pue,
      provenance: tempReal ? 'DERIVED' : 'SYNTHETIC',
      formula: '1.2 + 0.005 per °C above 15 °C + kind overhead − 0.005/yr efficiency gain (assumed coefficients)',
    },
    {
      key: 'facilityEnergyGwh',
      label: 'Facility energy use (annualized)',
      unit: 'GWh/yr',
      value: impact.annualEnergyGwh,
      provenance: 'SYNTHETIC',
      formula: 'IT load × PUE × 8760 h',
    },
    {
      key: 'facilityCo2Kt',
      label: 'Facility CO₂ (annualized)',
      unit: 'kt/yr',
      value: impact.co2KtPerYear,
      provenance: 'SYNTHETIC',
      formula: 'Facility energy × grid carbon intensity (assumed load, real grid)',
    },
    {
      key: 'regionalCo2Kt',
      label: 'National CO₂e (before facility)',
      unit: 'kt/yr',
      value: baseline.regionalCo2KtPerYear,
      provenance: realOrTrend(raw.dataSource === 'climatetrace'),
      source: raw.dataSource === 'climatetrace' ? 'Climate TRACE' : undefined,
      formula:
        raw.dataSource === 'climatetrace'
          ? `Climate TRACE ${raw.dataYear} country total, compounded by its year-over-year change (${raw.countryChangePct?.toFixed(1)} %, clamped ±10)`
          : 'Heuristic placeholder (no Climate TRACE data)',
    },
    {
      key: 'regionalEnergyGwh',
      label: 'National electricity demand (before facility)',
      unit: 'GWh/yr',
      value: baseline.regionalEnergyGwhPerYear,
      provenance: realOrTrend(raw.energySource === 'ember'),
      source: raw.energySource === 'ember' ? 'Ember' : undefined,
      formula:
        raw.energySource === 'ember'
          ? `Ember ${raw.energyDataYear} demand, compounded along its 2010–2024 trend (${raw.demandSlopePctPerYear?.toFixed(1)} %/yr)`
          : 'Heuristic placeholder (no Ember data)',
    },
    {
      key: 'waterM3PerDay',
      label: 'Facility cooling water',
      unit: 'm³/day',
      value: impact.waterM3PerDay,
      provenance: 'SYNTHETIC',
      formula: 'Facility energy × water-use factor 0.9–1.9 L/kWh rising with temperature (assumed)',
    },
    {
      key: 'heatWasteMw',
      label: 'Waste heat rejected',
      unit: 'MW',
      value: impact.heatWasteMw,
      provenance: 'SYNTHETIC',
      formula: 'IT load × (PUE − 1)',
    },
    {
      key: 'windTurbines',
      label: '5 MW wind turbines to cover a year',
      unit: 'turbines',
      value: footprint.windTurbines,
      provenance: footprint.windReal ? 'DERIVED' : 'SYNTHETIC',
      formula: `Energy ÷ (5 MW × capacity factor ${(footprint.windCf * 100).toFixed(0)} % × 8760 h); capacity factor from site wind scaled to 100 m hub height`,
    },
    {
      key: 'solarKm2',
      label: 'Utility solar area to cover a year',
      unit: 'km²',
      value: footprint.solarKm2,
      provenance: footprint.solarReal ? 'DERIVED' : 'SYNTHETIC',
      formula: `Energy ÷ (200 MWp/km² × ${footprint.solarKwhM2Day.toFixed(1)} kWh/m²·day site irradiance × 0.8 performance ratio × 365)`,
    },
    {
      key: 'suitabilityScore',
      label: 'Site suitability score',
      unit: '/100',
      value: assessment.score,
      provenance: 'DERIVED',
      formula: 'Weighted traffic-light verdicts (cooling, water, grid, solar, altitude) with assumed weights per facility kind',
    },
  ];

  return { baseline, annualBaseline, impact, assessment, footprint, metrics };
}

// ── AI explain snapshot + client ───────────────────────────────────

const round = (v: number) => Math.round(v * 100) / 100;

export interface ExplainSnapshot {
  site: { name: string; lat: number; lon: number; country?: string };
  facilityKind: string;
  operationsScenario: string;
  placedMonth: string;
  selectedMonth: string;
  selectedMonthLabel: string;
  metrics: {
    key: string;
    label: string;
    unit: string;
    initial: number;
    projected?: number;
    provenance: Provenance;
    source?: string;
    formula: string;
  }[];
  verdicts: { criterion: string; level: string; headline: string; detail: string }[];
}

/** Structured snapshot for /api/explain: initial values (placement
 *  month) and — when the timeline is elsewhere — the projected values
 *  at the selected month. */
export function buildExplainSnapshot(
  marker: PlacedMarker,
  kind: MarkerKindConfig,
  t: number,
): ExplainSnapshot {
  const initialT = Math.max(marker.placedYear, TIMELINE_START_YEAR);
  const initial = buildMarkerView(marker, initialT);
  const current = buildMarkerView(marker, t);
  const moved = Math.abs(t - initialT) > 1e-6;
  return {
    site: {
      name: marker.name,
      lat: round(marker.lat),
      lon: round(marker.lon),
      country: marker.baseline.countryName,
    },
    facilityKind: kind.label,
    operationsScenario: marker.operations.scenario,
    placedMonth: isoMonth(marker.placedYear),
    selectedMonth: isoMonth(t),
    selectedMonthLabel: formatMonth(t),
    metrics: current.metrics.map((m, i) => ({
      key: m.key,
      label: m.label,
      unit: m.unit,
      initial: round(initial.metrics[i].value),
      ...(moved && { projected: round(m.value) }),
      provenance: m.provenance,
      ...(m.source && { source: m.source }),
      formula: m.formula,
    })),
    verdicts: current.assessment.verdicts
      .filter((v) => !v.pending)
      .map((v) => ({ criterion: v.criterion, level: v.level, headline: v.headline, detail: v.detail })),
  };
}

const explainCache = new Map<string, string>();

/** POST the snapshot to the backend; memoized per snapshot. */
export async function fetchExplanation(snapshot: ExplainSnapshot): Promise<string> {
  const body = JSON.stringify(snapshot);
  const hit = explainCache.get(body);
  if (hit) return hit;
  const response = await fetch(`${BACKEND_BASE}/api/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
  if (!response.ok || !json?.text) {
    throw new Error(json?.error ?? `explain failed (${response.status})`);
  }
  explainCache.set(body, json.text);
  return json.text;
}
