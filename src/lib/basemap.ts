import type { StyleSpecification } from 'maplibre-gl';
// NOTE: the MapLibre worker URL fix lives in src/lib/maplibreWorker.ts —
// keep that module imported anywhere before the first map is created.

/**
 * PMTiles tile server on the minipc (see docs/ops/minipc.md); serves the
 * planetiler-built OpenMapTiles-schema archive of Europe at
 * `{TILES_BASE}/europe/tilejson.json`. Override with VITE_TILES_BASE.
 */
export const TILES_BASE: string =
  import.meta.env.VITE_TILES_BASE ?? 'http://dminipc.local:8081';

/**
 * Keyless public OpenMapTiles-schema archive (planet-wide). Same vector
 * layers as our own archive, so the style works against either. Used when
 * the minipc tile server is unreachable (e.g. developing off the hotspot).
 */
const FALLBACK_TILES_URL = 'https://tiles.openfreemap.org/planet/tilejson.json';

/**
 * Resolve the tilejson URL to render streets from: the team's PMTiles
 * archive when reachable, otherwise the public OpenFreeMap fallback.
 * Memoized: the intro map and the street map both need this at startup,
 * and the probe must not run twice (or twice the timeout would stack).
 */
let tilesUrlPromise: Promise<string> | null = null;
const SESSION_KEY = 'basemap.tilesUrl';

/** Call this as early as possible at boot (App module load). The probe
 *  then runs in parallel with chunk downloads instead of only starting
 *  when the intro map mounts. Nothing blocks on it. */
export function resolveTilesUrl(): Promise<string> {
  if (!tilesUrlPromise) tilesUrlPromise = probeTilesUrl();
  return tilesUrlPromise;
}

async function probeTilesUrl(): Promise<string> {
  // Per-tab session cache: reloads skip the network round-trip (and the
  // up-to-1.5 s timeout when the minipc is down) entirely.
  try {
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) return cached;
  } catch {
    // storage unavailable (privacy mode) — just probe
  }
  const url = await probeNetwork();
  try {
    sessionStorage.setItem(SESSION_KEY, url);
  } catch {
    // ignore
  }
  return url;
}

async function probeNetwork(): Promise<string> {
  const primary = `${TILES_BASE}/europe/tilejson.json`;
  try {
    // Short probe: the intro sits on a black logo screen while this
    // resolves, so a dead minipc must be given up on fast, not stall
    // the opening animation's whole map hold.
    const response = await fetch(primary, { signal: AbortSignal.timeout(1_500) });
    if (response.ok) return primary;
  } catch {
    // fall through to the public fallback
  }
  console.info('[basemap] minipc tile server unreachable — using OpenFreeMap fallback');
  return FALLBACK_TILES_URL;
}

/** Public glyph server for the (few) text layers; no local fonts needed. */
const GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

/** Dark control-room style over the team's own OpenMapTiles archive —
 *  colors from the global.css token palette. Shared by every 2D map
 *  (city detail, intro boot sequence). */
export function basemapStyle(tilesUrl: string): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      osm: { type: 'vector', url: tilesUrl },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#070d13' } },
      {
        id: 'water',
        type: 'fill',
        source: 'osm',
        'source-layer': 'water',
        paint: { 'fill-color': '#0a2233' },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'osm',
        'source-layer': 'waterway',
        paint: { 'line-color': '#0a2233', 'line-width': 1.5 },
      },
      {
        id: 'landcover-wood',
        type: 'fill',
        source: 'osm',
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'wood'],
        paint: { 'fill-color': '#0d1810' },
      },
      {
        id: 'landuse-park',
        type: 'fill',
        source: 'osm',
        'source-layer': 'park',
        paint: { 'fill-color': '#0e1a12' },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'osm',
        'source-layer': 'building',
        paint: { 'fill-color': '#141f28', 'fill-outline-color': '#1b2833' },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'path']]],
        paint: { 'line-color': '#1c2c38', 'line-width': 0.8 },
      },
      {
        id: 'road-secondary',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
        paint: { 'line-color': '#2a4152', 'line-width': 1.2 },
      },
      {
        id: 'road-major',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['primary', 'trunk', 'motorway']]],
        paint: { 'line-color': '#3d5d73', 'line-width': 1.8 },
      },
      {
        id: 'boundary-country',
        type: 'line',
        source: 'osm',
        'source-layer': 'boundary',
        filter: ['==', ['get', 'admin_level'], 2],
        paint: { 'line-color': '#75dce6', 'line-opacity': 0.35, 'line-width': 1 },
      },
      {
        id: 'place-city-label',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
        },
        paint: { 'text-color': '#c5d3d9', 'text-halo-color': '#05090d', 'text-halo-width': 1.5 },
      },
    ],
  };
}
