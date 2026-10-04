import {
  emberByIso3,
  waterStressByIso3,
} from './data/datasets';
import { nearestCountry } from './climatetrace/countryCentroids';
import type { LatLon } from './geo';
import {
  effectiveGridIntensity,
  estimateImpact,
  getMarkerKindConfig,
  type MarkerKind,
  type RegionBaseline,
} from './simulation';

/**
 * Site suitability — per-kind "is this place good for X?" verdicts.
 *
 * Every verdict cites the real datum behind it (NASA POWER weather,
 * Ember grid intensity, WRI Aqueduct water stress); when a dataset is
 * missing the criterion either degrades to a clearly labeled heuristic
 * or is dropped from the score entirely. Same style as projection.ts:
 * documented threshold tables, one formula per number, deterministic.
 */

export type VerdictLevel = 'good' | 'ok' | 'bad';

export interface Verdict {
  criterion: 'Cooling' | 'Water' | 'Grid' | 'Solar' | 'Altitude';
  level: VerdictLevel;
  /** Short plain-language verdict — the line you read first. */
  headline: string;
  /** The numbers behind the headline (smaller detail line). */
  detail: string;
  /** Where the datum comes from — shown as a badge. */
  source: 'NASA POWER' | 'EMBER' | 'AQUEDUCT' | 'HEURISTIC';
  /** True when data hasn't attached yet: shown dim, kept out of the score. */
  pending?: boolean;
}

export interface SiteSuitability {
  /** 0–100 weighted score over the criteria that have data. */
  score: number;
  verdicts: Verdict[];
}

// ── Criterion thresholds (all documented model constants) ──────────

// Cooling: 30-day mean T2M. ≤10 °C = free cooling dominates; >20 °C =
// mechanical cooling load. PUE follows estimateImpact's formula:
// 1.2 + max(0, T − 15) × 0.005 + kind bias.
const COOLING_GOOD_C = 10;
const COOLING_BAD_C = 20;
/** Wind that meaningfully helps natural/free cooling. */
const COOLING_WIND_MS = 3;

// Water: Aqueduct category (0 low … 4 extremely high). ≥3 with heat, or
// Medium-High + hot, constrains evaporative cooling.
const WATER_HOT_COMBO_C = 20;
const WATER_DRY_MM_DAY = 1;

// Grid: real Ember gCO₂/kWh (or heuristic share as fallback).
const GRID_GOOD_G = 120;
const GRID_BAD_G = 400;

// Solar: 30-day mean kWh/m²/day.
const SOLAR_GOOD_KWH = 4.5;
const SOLAR_BAD_KWH = 3;

// Altitude: buildability + thin-air cooling penalty above the tree line.
const ALTITUDE_OK_M = 1500;
const ALTITUDE_BAD_M = 2500;

/** Criterion weights per preset kind (custom kinds use the factory
 *  profile — a generic industrial load). Each column sums to 1. */
const WEIGHTS: Record<string, Record<Verdict['criterion'], number>> = {
  'data-center': { Cooling: 0.3, Water: 0.2, Grid: 0.25, Solar: 0.1, Altitude: 0.15 },
  'ai-data-center': { Cooling: 0.35, Water: 0.25, Grid: 0.25, Solar: 0.05, Altitude: 0.1 },
  'crypto-farm': { Cooling: 0.25, Water: 0.25, Grid: 0.3, Solar: 0.15, Altitude: 0.05 },
  factory: { Cooling: 0.1, Water: 0.1, Grid: 0.45, Solar: 0.05, Altitude: 0.3 },
};

const LEVEL_SCORE: Record<VerdictLevel, number> = { good: 100, ok: 55, bad: 0 };

/** PUE the model would compute at a 15 °C reference site. */
function referencePue(kind: MarkerKind): number {
  const cfg = getMarkerKindConfig(kind);
  return 1.2 + cfg.pueBias;
}

/**
 * Weighted per-kind verdicts for a site, evaluated against the (possibly
 * timeline-projected) baseline: cooling/grid criteria automatically use
 * projected temperature and grid intensity when the caller passes one.
 */
export function siteSuitability(baseline: RegionBaseline, kind: MarkerKind): SiteSuitability {
  const weights = WEIGHTS[kind] ?? WEIGHTS.factory;
  const tempLive = baseline.climateDataSource === 'nasa-power';
  const t = baseline.meanTempC;
  const pue = estimateImpact(baseline, kind).pue;
  const gridG = effectiveGridIntensity(baseline);
  const verdicts: Verdict[] = [];

  // ── Cooling climate ────────────────────────────────────────────
  const cooling: VerdictLevel = t <= COOLING_GOOD_C ? 'good' : t <= COOLING_BAD_C ? 'ok' : 'bad';
  const deltaVsTemperate = pue - referencePue(kind);
  const windNote =
    baseline.windMs !== undefined && baseline.windMs >= COOLING_WIND_MS
      ? ` · wind ${baseline.windMs.toFixed(1)} m/s helps`
      : '';
  verdicts.push({
    criterion: 'Cooling',
    level: cooling,
    headline:
      cooling === 'bad'
        ? 'Too hot — cooling eats power'
        : cooling === 'ok'
          ? 'Moderate cooling load'
          : 'Cold enough for free cooling',
    detail:
      `${t.toFixed(1)} °C ${
        baseline.climatology ? 'annual mean' : tempLive ? '30-day mean' : 'latitude estimate'
      } · ` +
      `PUE ≈ ${pue.toFixed(2)} (+${deltaVsTemperate.toFixed(2)} vs temperate)${windNote}`,
    source: tempLive ? 'NASA POWER' : 'HEURISTIC',
  });

  // ── Water for evaporative cooling ──────────────────────────────
  if (baseline.waterStressCat !== undefined) {
    const cat = baseline.waterStressCat;
    const hot = t > WATER_HOT_COMBO_C;
    const dry =
      baseline.precipMmDay !== undefined && baseline.precipMmDay < WATER_DRY_MM_DAY;
    const level: VerdictLevel =
      cat >= 3 || (cat === 2 && hot) ? 'bad' : cat === 2 || hot || dry ? 'ok' : 'good';
    const precipNote =
      baseline.precipMmDay !== undefined ? ` · ${baseline.precipMmDay.toFixed(1)} mm/day precip` : '';
    verdicts.push({
      criterion: 'Water',
      level,
      headline:
        level === 'bad'
          ? `Water stress constrains cooling${hot ? ' on a hot site' : ''}`
          : level === 'ok'
            ? 'Water is manageable — dry years may bite'
            : 'Ample water for cooling',
      detail: `${baseline.waterStressLabel} stress (WRI Aqueduct)${precipNote}`,
      source: 'AQUEDUCT',
    });
  } else {
    // Heuristic fallback: the synthetic water-stress index (labeled).
    const w = baseline.waterStressIndex;
    const level: VerdictLevel = w >= 60 ? 'bad' : w >= 35 ? 'ok' : 'good';
    verdicts.push({
      criterion: 'Water',
      level,
      headline:
        level === 'bad'
          ? 'Water looks stressed (estimated)'
          : level === 'ok'
            ? 'Water looks tight (estimated)'
            : 'Water looks ample (estimated)',
      detail: `no Aqueduct rating here — synthetic index ${w.toFixed(0)}/100`,
      source: 'HEURISTIC',
    });
  }

  // ── Grid cleanliness ───────────────────────────────────────────
  const gridLive = baseline.gridIntensityG !== undefined;
  const grid: VerdictLevel = gridG <= GRID_GOOD_G ? 'good' : gridG <= GRID_BAD_G ? 'ok' : 'bad';
  const co2 = estimateImpact(baseline, kind).co2KtPerYear;
  verdicts.push({
    criterion: 'Grid',
    level: grid,
    headline:
      grid === 'bad'
        ? 'Dirty grid — big CO₂ footprint'
        : grid === 'ok'
          ? 'Grid carbon is mid-range'
          : 'Clean grid power',
    detail:
      `${Math.round(gridG)} gCO₂/kWh ` +
      (gridLive
        ? baseline.gridProjected
          ? `(Ember trend from ${baseline.gridIntensityYear})`
          : `(Ember ${baseline.gridIntensityYear})`
        : '(renewable-share estimate)') +
      ` · ≈${co2.toFixed(0)} kt CO₂/yr for this load`,
    source: gridLive ? 'EMBER' : 'HEURISTIC',
  });

  // ── Solar resource ─────────────────────────────────────────────
  if (baseline.solarAvgKwhM2Day !== undefined) {
    const s = baseline.solarAvgKwhM2Day;
    const level: VerdictLevel = s >= SOLAR_GOOD_KWH ? 'good' : s >= SOLAR_BAD_KWH ? 'ok' : 'bad';
    verdicts.push({
      criterion: 'Solar',
      level,
      headline:
        level === 'good'
          ? 'Strong on-site solar potential'
          : level === 'ok'
            ? 'Usable solar backup'
            : 'Weak solar resource',
      detail: `${s.toFixed(1)} kWh/m²·day · ${
        baseline.climatology ? 'long-term annual mean' : '30-day avg'
      }`,
      source: 'NASA POWER',
    });
  } else if (weights.Solar >= 0.15) {
    // Solar matters for this kind but no real data yet — say so, and
    // keep it out of the score rather than guess.
    verdicts.push({
      criterion: 'Solar',
      level: 'ok',
      headline: 'Solar data pending',
      detail: 'attaches from NASA POWER shortly after placement',
      source: 'HEURISTIC',
      pending: true,
    });
  }

  // ── Altitude / buildability ────────────────────────────────────
  if (baseline.elevationM !== undefined) {
    const e = baseline.elevationM;
    const level: VerdictLevel = e > ALTITUDE_BAD_M ? 'bad' : e >= ALTITUDE_OK_M ? 'ok' : 'good';
    verdicts.push({
      criterion: 'Altitude',
      level,
      headline:
        level === 'bad'
          ? 'High altitude — thin air, harder cooling'
          : level === 'ok'
            ? 'Elevated site, mild penalties'
            : 'Easy terrain',
      detail: `${Math.round(e).toLocaleString('en-US')} m elevation`,
      source: 'NASA POWER',
    });
  }

  // Weighted score over criteria that produced a scored verdict.
  let weightSum = 0;
  let scoreSum = 0;
  const scored = verdicts.filter((v) => !v.pending);
  for (const v of scored) {
    const w = weights[v.criterion];
    if (!w) continue;
    weightSum += w;
    scoreSum += w * LEVEL_SCORE[v.level];
  }
  return { score: weightSum > 0 ? Math.round(scoreSum / weightSum) : 0, verdicts };
}

// ── Placement-mode outlook (cursor position, no network) ───────────

/**
 * Compact one-line outlook under the ghost-preview label while placing:
 * real Ember grid + Aqueduct water for the country under the cursor,
 * plus a latitude-band cooling estimate (no POWER request per pointer
 * move — the real satellite weather attaches on click).
 */
export function outlookSummary({ lat, lon }: LatLon, kind: MarkerKind): string {
  const parts: string[] = [];

  const a = Math.abs(lat);
  const cooling = a >= 48 ? 'good cooling' : a >= 35 ? 'ok cooling' : 'warm climate';
  parts.push(`${cooling} (lat est.)`);

  const iso = nearestCountry(lat, lon);
  const ember = iso ? emberByIso3.get(iso) : undefined;
  if (ember) {
    const g = ember.latestG;
    parts.push(g <= GRID_GOOD_G ? 'clean grid' : g <= GRID_BAD_G ? 'mid grid' : 'dirty grid');
  }
  const water = iso ? waterStressByIso3.get(iso) : undefined;
  if (water) {
    parts.push(
      water.cat >= 3 ? 'stressed water' : water.cat === 2 ? 'tight water' : 'ample water',
    );
  }
  if (parts.length === 1) parts.push('no country data here');

  const label = getMarkerKindConfig(kind).label;
  return `${label}: ${parts.join(' · ')}`;
}
