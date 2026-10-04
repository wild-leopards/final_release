import emberCsv from './ember-grid-intensity.csv?raw';
import aqueductCsv from './aqueduct-water-stress.csv?raw';
import emberEnergyCsv from './ember-demand-renewables.csv?raw';

/**
 * Bundled real country datasets (see CREDITS.md next to this file for
 * sources, licenses and extraction recipes):
 *
 * - Ember Yearly Electricity Data — grid carbon intensity 2010–2024,
 *   gCO₂e/kWh, 210 countries (+ `WRL` = world aggregate).
 * - WRI Aqueduct Country Rankings — baseline water stress category
 *   0–4 (industrial-user weighting), 162 countries.
 *
 * Both are parsed once at module load — no network, no keys, offline
 * safe. They drive the site-suitability verdicts and the per-country
 * projection slopes.
 */

/** Minimal CSV row splitter (handles the quoted country names). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

// ── Ember grid carbon intensity ────────────────────────────────────

/** One country's real intensity history, ascending by year. */
export interface EmberCountry {
  name: string;
  history: { year: number; g: number }[];
  /** Latest year with data (≤ EMBER_END_YEAR). */
  latestYear: number;
  /** Latest gCO₂e/kWh. */
  latestG: number;
}

export const EMBER_START_YEAR = 2010;
export const EMBER_END_YEAR = 2024;

/** Magnitude cap on any extrapolated trend — beyond this the history is
 *  noise, not a trend (spec: ±6 %/yr). */
export const MAX_SLOPE_PCT_PER_YEAR = 6;

function loadEmber(): Map<string, EmberCountry> {
  const rows = parseCsv(emberCsv);
  const header = rows[0];
  const col = (name: string) => header.indexOf(name);
  const byIso = new Map<string, EmberCountry>();
  for (const r of rows.slice(1)) {
    const iso = r[col('iso3')];
    const year = Number(r[col('year')]);
    const g = Number(r[col('gco2_kwh')]);
    if (!iso || !Number.isFinite(year) || !Number.isFinite(g)) continue;
    let entry = byIso.get(iso);
    if (!entry) {
      entry = { name: r[col('name')], history: [], latestYear: year, latestG: g };
      byIso.set(iso, entry);
    }
    entry.history.push({ year, g });
    if (year > entry.latestYear) { entry.latestYear = year; entry.latestG = g; }
  }
  return byIso;
}

export const emberByIso3: ReadonlyMap<string, EmberCountry> = loadEmber();

/** World aggregate intensity (fallback value for unknown countries). */
export const worldGridIntensity: EmberCountry =
  emberByIso3.get('WRL') ?? {
    name: 'World',
    history: [],
    latestYear: EMBER_END_YEAR,
    latestG: 480,
  };

/**
 * Annual %-change of a country's intensity: least-squares slope of
 * ln(gCO₂/kWh) against year over the 2010–2024 history, converted to
 * %/yr and clamped to ±6 %/yr. Falls back to the world slope when the
 * country (or its history) is missing — flagged in the result.
 */
export function emberSlopePctPerYear(
  iso3: string | undefined,
): { slopePctPerYear: number; source: 'ember' | 'world' } {
  const country = iso3 ? emberByIso3.get(iso3) : undefined;
  const target =
    country && country.history.length >= 5 ? country : worldGridIntensity;
  const slope = lnSlopePctPerYear(target.history);
  return {
    slopePctPerYear: slope,
    source: country && country.history.length >= 5 ? 'ember' : 'world',
  };
}

/** ln-regression of a {year, g} series, clamped, in %/yr. */
function lnSlopePctPerYear(history: { year: number; g: number }[]): number {
  const pts = history.filter((p) => p.g > 0);
  if (pts.length < 2) return 0;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.year, 0) / n;
  const my = pts.reduce((s, p) => s + Math.log(p.g), 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.year - mx) * (Math.log(p.g) - my);
    den += (p.year - mx) ** 2;
  }
  if (den === 0) return 0;
  const pctPerYear = (Math.exp(num / den) - 1) * 100;
  return Math.max(-MAX_SLOPE_PCT_PER_YEAR, Math.min(MAX_SLOPE_PCT_PER_YEAR, pctPerYear));
}

// ── WRI Aqueduct baseline water stress ─────────────────────────────

/** Aqueduct category 0–4; labels are withdrawal-to-availability bands. */
export interface WaterStress {
  name: string;
  cat: 0 | 1 | 2 | 3 | 4;
  label: string;
}

function loadAqueduct(): Map<string, WaterStress> {
  const rows = parseCsv(aqueductCsv);
  const header = rows[0];
  const col = (name: string) => header.indexOf(name);
  const byIso = new Map<string, WaterStress>();
  for (const r of rows.slice(1)) {
    const iso = r[col('iso3')];
    const cat = Number(r[col('cat')]);
    if (!iso || !Number.isInteger(cat) || cat < 0 || cat > 4) continue;
    byIso.set(iso, { name: r[col('name')], cat: cat as WaterStress['cat'], label: r[col('label')] });
  }
  return byIso;
}

export const waterStressByIso3: ReadonlyMap<string, WaterStress> = loadAqueduct();

// ── Ember electricity demand + renewable share ─────────────────────

/** One country's real electricity demand + renewable generation share
 *  (Ember Yearly Electricity Data, 2010–2024), with history trends. */
export interface EmberEnergy {
  name: string;
  latestYear: number;
  /** National electricity demand, TWh/yr (latest year). */
  demandTwh: number;
  /** Renewable share of generation, % (latest year). */
  renewablePct: number;
  /** ln-regression trend of demand, %/yr (clamped ±6). */
  demandSlopePctPerYear: number;
  /** Linear trend of the renewable share over the last 10 years, pp/yr
   *  (clamped ±3). */
  renewableSlopePpPerYear: number;
}

/** Least-squares slope of y against x. */
function linearSlope(pts: { x: number; y: number }[]): number {
  if (pts.length < 2) return 0;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function loadEmberEnergy(): Map<string, EmberEnergy> {
  const rows = parseCsv(emberEnergyCsv);
  const header = rows[0];
  const col = (name: string) => header.indexOf(name);
  const series = new Map<string, { name: string; pts: { year: number; d: number; r: number }[] }>();
  for (const r of rows.slice(1)) {
    const iso = r[col('iso3')];
    const year = Number(r[col('year')]);
    const d = Number(r[col('demand_twh')]);
    const ren = Number(r[col('renewable_pct')]);
    if (!iso || !Number.isFinite(year) || !Number.isFinite(d) || !Number.isFinite(ren)) continue;
    let entry = series.get(iso);
    if (!entry) {
      entry = { name: r[col('name')], pts: [] };
      series.set(iso, entry);
    }
    entry.pts.push({ year, d, r: ren });
  }
  const out = new Map<string, EmberEnergy>();
  for (const [iso, { name, pts }] of series) {
    pts.sort((a, b) => a.year - b.year);
    const last = pts[pts.length - 1];
    const demandSlope = lnSlopePctPerYear(pts.map((p) => ({ year: p.year, g: p.d })));
    const recent = pts.filter((p) => p.year > last.year - 10);
    const renSlope = Math.max(-3, Math.min(3, linearSlope(recent.map((p) => ({ x: p.year, y: p.r })))));
    out.set(iso, {
      name,
      latestYear: last.year,
      demandTwh: last.d,
      renewablePct: last.r,
      demandSlopePctPerYear: pts.length >= 5 ? demandSlope : 0,
      renewableSlopePpPerYear: pts.length >= 5 ? renSlope : 0,
    });
  }
  return out;
}

export const emberEnergyByIso3: ReadonlyMap<string, EmberEnergy> = loadEmberEnergy();
