/**
 * Climate TRACE API client (v7, live public API).
 *
 * Docs: https://api.climatetrace.org/v7  (OpenAPI: /v7/docs/openapi.json)
 * Data portal: https://climatetrace.org/data
 *
 * The API is free, keyless and CORS-enabled. Country rankings are
 * monthly from 2015 onward; asset-level ("source") data yearly from 2021.
 *
 * This client caches shared responses in module scope so many markers
 * reuse one network round-trip per year.
 */

const API_BASE = 'https://api.climatetrace.org/v7';

/** Reference year the app requests by default. */
export const TRACE_DATA_YEAR = 2024;

// ── Response shapes (subset of the OpenAPI models we consume) ──────

export interface CountryRanking {
  rank: number;
  /** ISO3 code, e.g. "BGR". */
  country: string;
  name: string;
  gas: string;
  /** Tonnes CO₂e for the requested period. */
  emissionsQuantity: number;
  emissionsPerCapita: number;
  /** Share of the global total, 0–100. */
  percentage: number;
  /** Year-over-year change, percent. */
  emissionsPercentChange: number;
}

export interface CountryRankingsResponse {
  totals: {
    gas: string;
    emissionsQuantity: number;
    start: string;
    end: string;
  };
  location: { name: string };
  rankings: CountryRanking[];
}

export interface TraceSource {
  /** Stable numeric asset id. */
  source_id: number;
  /** Human-readable asset name, e.g. "Maritsa Iztok Complex". */
  source_name?: string;
  name?: string;
  sector?: string;
  subsector?: string;
  /** Tonnes CO₂e for the requested year. */
  emissionsQuantity?: number;
  emissions?: number;
  countryCode?: string;
  adminName?: string;
}

/** One row of the `/v7/sources` rankings response. */
export interface RankedSource {
  id?: number | string;
  sourceId?: number | string;
  source_id?: number | string;
  name?: string;
  sourceName?: string;
  sector?: string;
  subsector?: string;
  country?: string;
  assetType?: string;
  emissions?: number;
  emissionsQuantity?: number;
  centroid?: { latitude: number; longitude: number };
  [key: string]: unknown;
}

// ── Cached fetchers ────────────────────────────────────────────────

const rankingsCache = new Map<number, Promise<CountryRankingsResponse>>();

/** Country-by-country CO₂e rankings for a year (cached per year). */
export function fetchCountryRankings(
  year: number = TRACE_DATA_YEAR,
): Promise<CountryRankingsResponse> {
  const cached = rankingsCache.get(year);
  if (cached) return cached;

  const promise = (async () => {
    const url = `${API_BASE}/rankings/countries?start=${year}&end=${year}&gas=co2e_100yr`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Climate TRACE rankings ${res.status}`);
    return (await res.json()) as CountryRankingsResponse;
  })();

  rankingsCache.set(year, promise);
  // Drop the cache entry on failure so a later marker can retry.
  promise.catch(() => rankingsCache.delete(year));
  return promise;
}

const sourcesCache = new Map<string, Promise<RankedSource[]>>();

/** Top-emitting individual facilities within a country (cached). */
export function fetchTopSources(
  iso3: string,
  year: number = TRACE_DATA_YEAR,
  limit = 5,
): Promise<RankedSource[]> {
  const key = `${iso3}:${year}:${limit}`;
  const cached = sourcesCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const url =
      `${API_BASE}/sources?gadmId=${encodeURIComponent(iso3)}` +
      `&year=${year}&gas=co2e_100yr&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Climate TRACE sources ${res.status}`);
    const json = (await res.json()) as RankedSource[] | { results?: RankedSource[] };
    return Array.isArray(json) ? json : json.results ?? [];
  })();

  sourcesCache.set(key, promise);
  promise.catch(() => sourcesCache.delete(key));
  return promise;
}

/** Global totals row for a year (convenience accessor over rankings). */
export async function fetchGlobalTotal(
  year: number = TRACE_DATA_YEAR,
): Promise<number> {
  const data = await fetchCountryRankings(year);
  return data.totals.emissionsQuantity;
}

/** Find a country's ranking row by ISO3 code. */
export async function findCountryRanking(
  iso3: string,
  year: number = TRACE_DATA_YEAR,
): Promise<CountryRanking | null> {
  const data = await fetchCountryRankings(year);
  return data.rankings.find((r) => r.country === iso3) ?? null;
}

// ── Global threat layer (largest single emitters) ──────────────────

/** One "biggest threat" marker for the globe: a real facility or
 *  aggregated area with its position and emissions. */
export interface TraceThreat {
  id: string;
  name: string;
  sector?: string;
  subsector?: string;
  country?: string;
  assetType?: string;
  /** Tonnes CO₂e for the data year. */
  emissionsT: number;
  lat: number;
  lon: number;
}

const threatsCache = new Map<number, Promise<TraceThreat[]>>();

/** Numeric emissions out of a `/v7/sources` row across API versions. */
function sourceEmissionsT(src: RankedSource): number {
  const v = src.emissionsQuantity ?? src.emissions;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : 0;
  return Number.isFinite(n) ? n : 0;
}

/** The world's largest individual emission sources (cached per year). */
export function fetchGlobalTopSources(
  year: number = TRACE_DATA_YEAR,
  limit = 60,
): Promise<TraceThreat[]> {
  const cached = threatsCache.get(year);
  if (cached) return cached;

  const promise = (async () => {
    const url = `${API_BASE}/sources?year=${year}&gas=co2e_100yr&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Climate TRACE sources ${res.status}`);
    const rows = (await res.json()) as RankedSource[];
    return rows
      .map((src, i) => {
        const centroid = src.centroid as
          | { latitude?: number; longitude?: number }
          | undefined;
        const rawName =
          (src.name as string | undefined) ?? `Asset #${String(src.id ?? i)}`;
        return {
          id: String(src.id ?? i),
          name: rawName,
          sector: src.sector,
          subsector: src.subsector,
          country: src.country,
          assetType: src.assetType,
          emissionsT: sourceEmissionsT(src),
          lat: centroid?.latitude ?? NaN,
          lon: centroid?.longitude ?? NaN,
        } satisfies TraceThreat;
      })
      .filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lon));
  })();

  threatsCache.set(year, promise);
  promise.catch(() => threatsCache.delete(year));
  return promise;
}


export function formatTonnes(tonnes: number): string {
  const abs = Math.abs(tonnes);
  if (abs >= 1e9) return `${(tonnes / 1e9).toFixed(2)} Gt`;
  if (abs >= 1e6) return `${(tonnes / 1e6).toFixed(1)} Mt`;
  if (abs >= 1e3) return `${(tonnes / 1e3).toFixed(1)} kt`;
  return `${tonnes.toFixed(0)} t`;
}
