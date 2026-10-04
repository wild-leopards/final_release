/**
 * NASA POWER backend client.
 *
 * Talks to our own Java service (see docs/backend/deployment.md) which
 * proxies the NASA POWER satellite API: daily all-sky solar radiation
 * (ALLSKY_SFC_SW_DWN, kWh/m²/day) and meteorological parameters
 * (T2M = 2m air temperature) for any point on Earth.
 *
 * The service runs on the team minipc, reached via mDNS as
 * dminipc.local (works on any IP the hotspot assigns); override with
 * VITE_POWER_API_BASE in .env.local when developing elsewhere.
 */

const POWER_API_BASE: string =
  import.meta.env.VITE_POWER_API_BASE ?? 'http://dminipc.local:8080';

/** Days of daily values the app requests. */
export const POWER_WINDOW_DAYS = 30;

export interface PowerStats {
  count: number;
  avg: number;
  min: number;
  max: number;
  total: number;
}

export interface SolarResponse {
  request: { lat: number; lon: number; start: string; end: string };
  daily: Record<string, number>;
  stats: PowerStats;
}

export interface WeatherResponse {
  request: { lat: number; lon: number; parameters: string; start: string; end: string };
  parameters: Record<string, Record<string, number>>;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${POWER_API_BASE}${path}`, {
    signal: AbortSignal.timeout(90_000), // NASA POWER can be slow
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `power api ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Daily solar radiation + stats for a site (last 30 days by default). */
export function fetchSolar(lat: number, lon: number): Promise<SolarResponse> {
  return getJson(`/api/solar?lat=${lat}&lon=${lon}`);
}

/** Daily values for arbitrary POWER parameters, e.g. 'T2M'. */
export function fetchWeather(
  lat: number,
  lon: number,
  parameters: string,
): Promise<WeatherResponse> {
  return getJson(
    `/api/weather?lat=${lat}&lon=${lon}&parameters=${encodeURIComponent(parameters)}`,
  );
}

/** One climatology parameter: 12 monthly long-term means (Jan..Dec)
 *  plus the annual mean. */
export interface ClimatologySeries {
  monthly: number[];
  annual: number;
}

export interface ClimatologyResponse {
  request: { lat: number; lon: number };
  parameters: Partial<Record<'T2M' | 'ALLSKY_SFC_SW_DWN' | 'WS2M', ClimatologySeries>>;
}

/** NASA POWER long-term monthly climatology (T2M °C, solar
 *  kWh/m²/day, WS2M m/s) for a site. */
export function fetchClimatology(lat: number, lon: number): Promise<ClimatologyResponse> {
  return getJson(`/api/climatology?lat=${lat}&lon=${lon}`);
}

/** Base URL of the backend (shared with the explain client). */
export const BACKEND_BASE = POWER_API_BASE;
