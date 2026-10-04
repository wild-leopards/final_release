import type {
  ImpactEstimate,
  OperationsProfile,
  PlacedMarker,
  RegionBaseline,
} from './simulation';
import { effectiveGridIntensity, pueAt, shareFromIntensity, wueAt } from './simulation';

/**
 * Timeline projection model — turns the real data attached at placement
 * time (Climate TRACE country emissions + YoY trend, NASA POWER
 * temperature/solar) into deterministic year-by-year FUTURE estimates,
 * so the timeline can scrub 2026 → 2050 and show BEFORE → AFTER per
 * placed object at any year.
 *
 * Everything here is pure and explainable: every number is one documented
 * formula over the real baseline. No randomness, no fitting to data we
 * don't have. Constants below are the model's only knobs.
 */

/** First year on the timeline ("now" for the simulation). */
export const TIMELINE_START_YEAR = 2026;
/** Last year on the timeline (runs through its December). */
export const TIMELINE_END_YEAR = 2050;

/**
 * Time on the timeline is a fractional year `t`: Jan 2026 = 2026.0,
 * Mar 2031 = 2031 + 2/12. One scrub position per month, 300 in total.
 * Every model below is closed-form in `t`, so monthly steps are smooth
 * interpolations of the yearly trends; weather-driven inputs add the
 * real NASA POWER monthly normals on top (seasonality).
 */
export const TIMELINE_MONTHS = (TIMELINE_END_YEAR - TIMELINE_START_YEAR + 1) * 12;
/** Last scrub position (Dec 2050) as a fractional year. */
export const TIMELINE_END_TIME = TIMELINE_START_YEAR + (TIMELINE_MONTHS - 1) / 12;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Month index on the timeline (0 = Jan 2026) of a fractional year. */
export function monthIndexOf(t: number): number {
  return Math.round((t - TIMELINE_START_YEAR) * 12);
}

/** Fractional year of a timeline month index. */
export function timeOfMonthIndex(index: number): number {
  return TIMELINE_START_YEAR + index / 12;
}

/** Calendar month 0–11 of a fractional year. */
export function calendarMonth(t: number): number {
  return ((monthIndexOf(t) % 12) + 12) % 12;
}

/** Calendar year of a fractional year. */
export function calendarYear(t: number): number {
  return TIMELINE_START_YEAR + Math.floor(monthIndexOf(t) / 12);
}

/** "Mar 2031". */
export function formatMonth(t: number): string {
  return `${MONTH_NAMES[calendarMonth(t)]} ${calendarYear(t)}`;
}

/** ISO-ish "2031-03" for machine snapshots. */
export function isoMonth(t: number): string {
  return `${calendarYear(t)}-${String(calendarMonth(t) + 1).padStart(2, '0')}`;
}

/** Construction ramp: a facility averages half load in its placement
 *  year, then ramps linearly to full output over this many further
 *  years (half -> 75 % -> 100 % for the default 2). */
export const RAMP_YEARS = 2;

/** Ramp fraction in a given year: half load at placement, full output
 *  exactly RAMP_YEARS later. */
function rampFraction(year: number, placedYear: number): number {
  if (year < placedYear) return 0; // not built yet
  return clamp01(0.5 + 0.5 * ((year - placedYear) / RAMP_YEARS));
}

/** Grid decarbonization, heuristic fallback (no Ember data): renewable
 *  share grows this many percentage points per year (EU-style trend)
 *  up to the cap. Ember-backed sites project their measured country
 *  slope instead — see `projectGridIntensity`. */
export const RENEWABLE_GROWTH_PP_PER_YEAR = 1.5;
export const RENEWABLE_CAP_PCT = 95;

/** Grid intensity floors/ceiling for Ember-slope projections (gCO₂/kWh):
 *  no grid gets cleaner than ~a rich-hydro system, and none dirtier
 *  than ~pure coal, however far a trend is extrapolated. */
export const GRID_FLOOR_G = 20;
export const GRID_CEILING_G = 1000;

/** Rising grid-intensity trends bend after this year: each year past it
 *  halves their effective slope (S-curve-style deceleration — dirty
 *  grids eventually clean up or saturate; falling trends pass through). */
export const GRID_BEND_YEAR = 2040;

/** Efficiency drift: PUE improves slightly each operating year. */
export const PUE_IMPROVEMENT_PER_YEAR = 0.005;
export const PUE_FLOOR = 1.15;

/** Regional warming drift applied to the site mean temperature. */
export const WARMING_C_PER_YEAR = 0.03;

/** Demand-scenario ceiling: a facility's IT load can exceed nameplate at
 *  most this factor before it hits the physical grid-connection /
 *  cooling-plant limit — growth compounding past it flattens out (a
 *  capacity-expansion event would be what raises the limit; not modelled).
 *  Cross-checks the research note that site load growth is always
 *  capacity-constrained, never compounded cleanly to 2050. */
export const DEMAND_FACTOR_MAX = 3;

/** Demand floor when a decline scenario is applied: a facility can idle
 *  down to this share of nameplate but never go negative. */
export const DEMAND_FACTOR_MIN = 0.05;

/** Clamp on the Climate TRACE YoY trend when compounding it forward —
 *  guards against extreme reported swings exploding over 20+ years. */
const MAX_YOY_CHANGE_PCT = 10;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** Years elapsed on the timeline since "now" (never negative). */
function yearsSinceStart(year: number): number {
  return Math.max(0, year - TIMELINE_START_YEAR);
}

/**
 * Project a real grid carbon intensity from its data year to a timeline
 * year, using the country's own Ember-history slope (%/yr, clamped
 * ±6 %/yr when regressed — see `emberSlopePctPerYear`).
 *
 * - Falling trends compound cleanly down to the 20 gCO₂/kWh floor.
 * - Rising trends decelerate past 2040 (effective slope halves every
 *  year beyond it — an S-curve-style bend, so dirty grids don't grow
 *  monotonically forever) and stop at the 1000 gCO₂/kWh ceiling.
 */
export function projectGridIntensity(
  startG: number,
  startYear: number,
  slopePctPerYear: number,
  year: number,
): number {
  let ln = Math.log(Math.max(GRID_FLOOR_G, startG));
  const s = slopePctPerYear / 100;
  // Rising trends bend after GRID_BEND_YEAR; falling ones don't.
  const eff = (y: number) => (s > 0 && y > GRID_BEND_YEAR ? s / (1 + (y - GRID_BEND_YEAR)) : s);
  let y = startYear;
  while (y + 1 <= year) {
    y++;
    ln += Math.log1p(eff(y));
  }
  // Fractional (monthly) remainder: log-linear interpolation into the
  // next year's step, so every month sits on the yearly curve.
  const frac = year - y;
  if (frac > 0) ln += frac * Math.log1p(eff(y + 1));
  return clamp(Math.exp(ln), GRID_FLOOR_G, GRID_CEILING_G);
}

/**
 * Project a region's baseline to a timeline year.
 *
 * - Country CO₂: compounds the REAL Climate TRACE year-over-year change
 *   (clamped to ±10 %/yr) year by year from the timeline start — at the
 *   start year the measured value is shown as-is, so the first scrub
 *   step applies ONE year of trend, not the whole 2024→2027 gap at
 *   once. Heuristic baselines (no TRACE data) stay flat: we have no
 *   real trend to extrapolate.
 * - Grid: Ember-backed sites carry their country's REAL intensity and
 *   history slope — `projectGridIntensity` compounds it year by year
 *   (every scrubbed year traceable to the 2010–2024 history; the world
 *   slope is used for unknown countries, labeled in the baseline).
 *   Without Ember data the heuristic +1.5 pp/yr share growth applies.
 * - Mean temperature: +0.03 °C/yr warming drift (feeds PUE/cooling).
 */
export function projectBaseline(
  baseline: RegionBaseline,
  year: number,
  opts: { seasonal?: boolean } = {},
): RegionBaseline {
  const seasonal = opts.seasonal ?? true;
  const elapsed = yearsSinceStart(year);
  const clim = baseline.climatology;
  // Weather inputs: the real monthly normal for the scrubbed month when
  // seasonal, the annual normal otherwise — plus the warming drift.
  const month = calendarMonth(year);
  const weather: Partial<RegionBaseline> = clim
    ? {
        meanTempC: (seasonal ? clim.tempC[month] : clim.annualTempC) + WARMING_C_PER_YEAR * elapsed,
        solarAvgKwhM2Day: seasonal ? clim.solarKwhM2Day[month] : clim.annualSolarKwhM2Day,
        windMs: seasonal ? clim.windMs[month] : clim.annualWindMs,
      }
    : { meanTempC: baseline.meanTempC + WARMING_C_PER_YEAR * elapsed };
  if (elapsed === 0 && !clim) return baseline;

  let regionalCo2KtPerYear = baseline.regionalCo2KtPerYear;
  if (baseline.dataSource === 'climatetrace' && baseline.countryChangePct !== undefined) {
    // Compound forward from the timeline start, not from the data year:
    // the start month shows the raw measurement, each month after it
    // adds 1/12 of a year of trend (smooth interpolation).
    const fromYear = Math.max(baseline.dataYear ?? TIMELINE_START_YEAR, TIMELINE_START_YEAR);
    const years = Math.max(0, year - fromYear);
    const yoy = clamp(baseline.countryChangePct, -MAX_YOY_CHANGE_PCT, MAX_YOY_CHANGE_PCT);
    regionalCo2KtPerYear = Math.max(0, baseline.regionalCo2KtPerYear * (1 + yoy / 100) ** years);
  }

  // Real Ember national demand compounds along its own 2010–2024 trend.
  let regionalEnergyGwhPerYear = baseline.regionalEnergyGwhPerYear;
  if (baseline.energySource === 'ember' && baseline.demandSlopePctPerYear !== undefined) {
    regionalEnergyGwhPerYear *= (1 + baseline.demandSlopePctPerYear / 100) ** elapsed;
  }

  // Renewable share: real Ember share + its 10-year pp/yr trend when we
  // have it; otherwise derived from the projected grid / heuristic.
  const realShare =
    baseline.renewableSource === 'ember' && baseline.renewableSlopePpPerYear !== undefined
      ? clamp(
          baseline.renewableSharePct + baseline.renewableSlopePpPerYear * elapsed,
          0,
          Math.max(RENEWABLE_CAP_PCT, baseline.renewableSharePct),
        )
      : undefined;

  if (
    baseline.gridIntensityG !== undefined &&
    baseline.gridIntensityYear !== undefined &&
    baseline.gridSlopePctPerYear !== undefined
  ) {
    const gridIntensityG = projectGridIntensity(
      baseline.gridIntensityG,
      Math.max(baseline.gridIntensityYear, TIMELINE_START_YEAR),
      baseline.gridSlopePctPerYear,
      year,
    );
    return {
      ...baseline,
      ...weather,
      regionalCo2KtPerYear,
      regionalEnergyGwhPerYear,
      gridIntensityG,
      gridProjected: elapsed > 0,
      renewableSharePct: realShare ?? shareFromIntensity(gridIntensityG),
    };
  }

  return {
    ...baseline,
    ...weather,
    regionalCo2KtPerYear,
    regionalEnergyGwhPerYear,
    renewableSharePct:
      realShare ??
      Math.min(RENEWABLE_CAP_PCT, baseline.renewableSharePct + RENEWABLE_GROWTH_PP_PER_YEAR * elapsed),
  };
}

/** Load multiplier from the facility's demand scenario: how many times
 *  the nameplate IT load the site is actually drawing at `year`.
 *
 *  `demand(Y) = clamp((1 + g/100)^(Y − Yp), DEMAND_FACTOR_MIN … MAX)`
 *  where `g` = the scenario's %/yr growth (negative for decline).
 *  Compounding stops at DEMAND_FACTOR_MAX (physical capacity limit) —
 *  a site can't outgrow its grid connection and cooling plant — and
 *  idles down to DEMAND_FACTOR_MIN under decline. Scenarios with 0 %
 *  growth return exactly 1. */
export function demandFactor(
  operations: OperationsProfile | undefined,
  placedYear: number,
  year: number,
): number {
  if (!operations || operations.annualDemandGrowthPct === 0) return 1;
  const years = Math.max(0, year - placedYear);
  const g = operations.annualDemandGrowthPct / 100;
  return clamp((1 + g) ** years, DEMAND_FACTOR_MIN, DEMAND_FACTOR_MAX);
}

/**
 * Project a placed facility's footprint to a timeline year.
 *
 * Re-evaluates the same equations as `estimateImpact` in simulation.ts,
 * with four time-dependent inputs: the construction ramp (0 → 100 %
 * over RAMP_YEARS, half load in the placement year), the demand
 * scenario (load multiplier over nameplate, capped at
 * DEMAND_FACTOR_MAX), the projected grid mix (facilities get cleaner
 * over time), and a slowly improving PUE.
 * Years before placement yield an all-zero footprint (not built yet).
 */
export function projectImpact(marker: PlacedMarker, year: number): ImpactEstimate {
  const baseline = projectBaseline(marker.baseline, year);
  const base = marker.impact; // snapshot at placement: capacity + base PUE

  const ramp = rampFraction(year, marker.placedYear);
  const operatingYears = Math.max(0, year - marker.placedYear);
  // PUE re-evaluated at this month's (seasonal, warming) temperature,
  // minus the slow efficiency drift.
  const pue = Math.max(
    PUE_FLOOR,
    pueAt(baseline.meanTempC, marker.kind) - PUE_IMPROVEMENT_PER_YEAR * operatingYears,
  );

  // Actual IT load at this year: nameplate ramped in and scaled by the
  // demand scenario (capped at the physical facility limit).
  const itLoadMw = base.capacityMw * demandFactor(marker.operations, marker.placedYear, year) * ramp;

  const annualEnergyGwh = itLoadMw * pue * 8.76;
  const gridIntensity = effectiveGridIntensity(baseline);
  const coolingFactor = wueAt(baseline.meanTempC);

  return {
    capacityMw: base.capacityMw,
    itLoadMw,
    pue,
    annualEnergyGwh,
    co2KtPerYear: (annualEnergyGwh * 1e6 * gridIntensity) / 1e9,
    waterM3PerDay: (annualEnergyGwh * 1e6 * coolingFactor) / 365 / 1000,
    heatWasteMw: itLoadMw * (pue - 1),
    renewableCoveragePct: baseline.renewableSharePct,
  };
}

/** Aggregate footprint of all facilities that exist in a timeline year. */
export interface TimelineSummary {
  /** Markers placed on or before `year` (the rest are not built yet). */
  activeCount: number;
  /** Sum of nameplate IT load of the facilities that exist at `year`. */
  capacityMw: number;
  /** Sum of actual IT load (nameplate × demand scenario × ramp). */
  itLoadMw: number;
  annualEnergyGwh: number;
  co2KtPerYear: number;
  waterM3PerDay: number;
  heatWasteMw: number;
}

/** Totals across all placed markers as of a timeline year. */
export function timelineSummary(markers: PlacedMarker[], year: number): TimelineSummary {
  return markers.reduce<TimelineSummary>(
    (sum, m) => {
      if (year < m.placedYear) return sum;
      const impact = projectImpact(m, year);
      return {
        activeCount: sum.activeCount + 1,
        capacityMw: sum.capacityMw + impact.capacityMw,
        itLoadMw: sum.itLoadMw + impact.itLoadMw,
        annualEnergyGwh: sum.annualEnergyGwh + impact.annualEnergyGwh,
        co2KtPerYear: sum.co2KtPerYear + impact.co2KtPerYear,
        waterM3PerDay: sum.waterM3PerDay + impact.waterM3PerDay,
        heatWasteMw: sum.heatWasteMw + impact.heatWasteMw,
      };
    },
    {
      activeCount: 0,
      capacityMw: 0,
      itLoadMw: 0,
      annualEnergyGwh: 0,
      co2KtPerYear: 0,
      waterM3PerDay: 0,
      heatWasteMw: 0,
    },
  );
}

/** Construction status of a marker in a timeline year, for UI notes. */
export type RampStatus =
  | { phase: 'not-built'; label: string }
  | { phase: 'ramping' | 'operational'; label: string };

/** Human-readable facility lifecycle label at a year ("Not built until
 *  2031", "Ramping up · 50 % load", "Operational · demand ×1.4", or
 *  "Operational · at capacity"). */
export function rampStatus(marker: PlacedMarker, year: number): RampStatus {
  if (year < marker.placedYear) {
    return { phase: 'not-built', label: `Not built until ${formatMonth(marker.placedYear)}` };
  }
  const ramp = rampFraction(year, marker.placedYear);
  if (ramp < 1) {
    return { phase: 'ramping', label: `Ramping up · ${Math.round(ramp * 100)}% load` };
  }
  const factor = demandFactor(marker.operations, marker.placedYear, year);
  if (factor >= DEMAND_FACTOR_MAX - 1e-6) {
    return { phase: 'operational', label: `Operational · at capacity (×${DEMAND_FACTOR_MAX})` };
  }
  if (factor > 1.005 || factor < 0.995) {
    return { phase: 'operational', label: `Operational · demand ×${factor.toFixed(1)} nameplate` };
  }
  return { phase: 'operational', label: 'Operational' };
}
