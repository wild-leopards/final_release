import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  GeoJSONSource,
  Map as MaplibreMap,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../lib/maplibreWorker'; // setWorkerUrl — must run before any map
import { cameraTelemetry, STREET_FADE_ACTIVE } from '../../lib/cameraTelemetry';
import { vector3ToLatLon } from '../../lib/geo3d';
import type { FlyTarget, LatLon } from '../../lib/geo';
import { resolveTilesUrl } from '../../lib/basemap';
import { BUNDLED_DATA_CENTERS } from '../../lib/osm/dataCentersBundled';
import type { DataCenterPoint } from '../../lib/osm/dataCenters';
import { getMarkerKindConfig } from '../../lib/simulation';
import type { ViewportMode } from './GlobeViewport';
import type { GhostMarkerView } from './GhostMarker';
import type { PlacedMarkerView } from './Markers';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';

interface StreetLevelProps {
  /** City-search target; used to prewarm tiles during the fly-to. */
  flyTarget: FlyTarget | null;
  /** Wrapper around the R3F canvas — faded out as the map fades in. */
  sceneWrapRef: RefObject<HTMLDivElement | null>;
  /** User-placed facilities — drawn on the street map alongside the
   *  bundled data centers when zoomed in. */
  markers: PlacedMarkerView[];
  /** Current viewport mode (idle / placing / relocating) — while not
   *  idle the street layer offers the same interactions as the globe. */
  mode: ViewportMode;
  /** Ghost preview payload (kind color) while placing/relocating. */
  ghost: GhostMarkerView | null;
  pendingLabel: string;
  /** Marker currently being relocated. */
  relocatingId: string | null;
  /** Marker whose action popup is open (re-click to open, like globe). */
  popupId: string | null;
  onSurfaceClick: (latLon: LatLon) => void;
  /** Throttled cursor site while placing/relocating (outlook line). */
  onSurfaceHover?: (latLon: LatLon) => void;
  onMarkerSelect: (id: string) => void;
  onMarkerRelocate: (id: string) => void;
  onMarkerRemove: (id: string) => void;
  onCancelRelocate: () => void;
  onDataCenterSelect?: (point: DataCenterPoint) => void;
}

/**
 * Tile source resolution lives in lib/basemap.ts (resolveTilesUrl): the
 * minipc PMTiles archive when reachable, public OpenFreeMap otherwise.
 */

/** Public glyph server for the (few) text layers; no local fonts needed. */
const GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

// ── Globe camera <-> MapLibre zoom mapping ─────────────────────────

const EARTH_RADIUS_M = 6_371_000;
const FOV_DEG = 45; // must match the Canvas camera in Globe.tsx
/** Meters per pixel at zoom 0, equator (MapLibre 512px vector tiles). */
const M_PER_PX_Z0 = 78_271.484;
/** Map-zoom band over which the street map fades with the globe
 *  (opacity + radial "render distance" mask — edges unrender first,
 *  like distant Minecraft chunks, before the globe re-takes over). */
const FADE_ZOOM_START = 8.25;
const FADE_ZOOM_END = 9.6;
/** Zoom the prewarm fetch runs at (street level, where you land). */
const PREWARM_ZOOM = 13.5;

/** Pointer travel (px) below which a press counts as a click, not an
 *  orbit/pan gesture — same rule as the globe surface (Earth.tsx). */
const CLICK_SLOP_PX = 6;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** MapLibre zoom whose meters-per-pixel matches what the globe camera
 *  sees at its current altitude above the surface point below it. */
function zoomForCamera(distToCenter: number, lat: number, viewportH: number): number {
  const altitude = Math.max(5e-5, distToCenter - 1); // globe radius is 1
  const globeMPerPx = (2 * altitude * EARTH_RADIUS_M * Math.tan(((FOV_DEG / 2) * Math.PI) / 180)) / viewportH;
  return Math.log2((M_PER_PX_Z0 * Math.cos((lat * Math.PI) / 180)) / globeMPerPx);
}

/** Radial "render-distance" mask on the street map: while the map is
 *  not fully opaque its edges are unrendered from the outside in — the
 *  globe looms through the hole like a shadow — until the center goes
 *  too (Minecraft chunk-unload feel, per the PM's spec). Called with a
 *  change-guarded gradient string ('none' when fully opaque). */
function applyStreetMask(wrap: HTMLDivElement, gradient: string): void {
  if (gradient === 'none') {
    wrap.style.maskImage = 'none';
    wrap.style.webkitMaskImage = 'none';
    return;
  }
  wrap.style.maskImage = gradient;
  wrap.style.webkitMaskImage = gradient;
}

/** Graticule: the planet-wide placeholder "chart" that shows wherever
 *  real vector tiles are not (yet) available. The step adapts to the map
 *  zoom — the crossfade only engages above map-zoom ~8, where fixed 10°
 *  lines are thousands of pixels apart, so nothing would ever cross the
 *  viewport and the placeholder would read as a dead renderer. */
function graticule(stepDeg: number): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];
  for (let i = 0; i * stepDeg <= 360; i++) {
    const lon = -180 + i * stepDeg;
    features.push({
      type: 'Feature',
      properties: { major: lon === 0 },
      geometry: { type: 'LineString', coordinates: [[lon, -85], [lon, 85]] },
    });
  }
  for (let i = 0; i * stepDeg <= 160; i++) {
    const lat = -80 + i * stepDeg;
    features.push({
      type: 'Feature',
      properties: { major: lat === 0 },
      geometry: { type: 'LineString', coordinates: [[-180, lat], [180, lat]] },
    });
  }
  return { type: 'FeatureCollection', features };
}

const GRID_START_STEP = 10;
/** Nice 1-2-5 steps; the 0.02 floor keeps the regenerated GeoJSON
 *  bounded (~26k lines) at the deepest street zoom. */
const GRID_STEPS = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02];

/** Graticule step (degrees) that keeps lines roughly ~200 px apart at
 *  the given MapLibre zoom (360° spans 512·2^zoom px). */
function graticuleStepForZoom(zoom: number): number {
  const targetDeg = (200 * 360) / (512 * 2 ** zoom);
  for (let i = GRID_STEPS.length - 1; i >= 0; i--) {
    if (GRID_STEPS[i] >= targetDeg) return GRID_STEPS[i];
  }
  return GRID_START_STEP;
}

/** Baseline style: background + graticule + facility dots only, so the
 *  placeholder chart renders no matter what the tile server does.
 *  (Putting the OSM source in the initial style stalls the whole style
 *  when the server is down — MapLibre waits on source metadata before
 *  drawing. The facilities layer is our own GeoJSON — always safe.) */
const baseStyle = (): StyleSpecification => ({
  version: 8,
  glyphs: GLYPHS,
  sources: {
    grid: { type: 'geojson', data: graticule(GRID_START_STEP) },
    facilities: { type: 'geojson', data: facilitiesGeoJson([]) },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#070d13' } },
    {
      id: 'grid-minor',
      type: 'line',
      source: 'grid',
      filter: ['!=', ['get', 'major'], true],
      paint: { 'line-color': '#75dce6', 'line-opacity': 0.2, 'line-width': 1 },
    },
    {
      id: 'grid-major',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'major'], true],
      paint: { 'line-color': '#75dce6', 'line-opacity': 0.4, 'line-width': 1 },
    },
    // Existing + user-placed facilities: a dot once street zoom starts,
    // its name once individual streets are readable. Both are clickable:
    // the street layer hit-tests these (StreetLevel pointer handlers).
    {
      id: 'facilities-dot',
      type: 'circle',
      source: 'facilities',
      minzoom: 10.5,
      paint: {
        'circle-radius': 5,
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#05090d',
        'circle-stroke-width': 1.5,
      },
    },
    {
      id: 'facilities-label',
      type: 'symbol',
      source: 'facilities',
      minzoom: 12,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-offset': [0, 1.4],
        'text-anchor': 'top',
      },
      paint: { 'text-color': '#e3b6d5', 'text-halo-color': '#05090d', 'text-halo-width': 1.5 },
    },
  ],
});

/** Facility points for the street map: every bundled data center plus
 *  the user's placements, each carrying its stable id (for hit-testing),
 *  display name and accent. `ref` encodes which source to resolve:
 *  numeric index into BUNDLED_DATA_CENTERS vs a marker id string. */
function facilitiesGeoJson(markers: PlacedMarkerView[]): FeatureCollection<Point> {
  const dcFeatures: Feature<Point>[] = BUNDLED_DATA_CENTERS.map((d, i) => ({
    type: 'Feature',
    properties: { ref: i, kind: 'dc', name: d.name, color: '#42d7e8' },
    geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
  }));
  const markerFeatures: Feature<Point>[] = markers.map((m) => ({
    type: 'Feature',
    properties: {
      ref: m.id,
      kind: 'user',
      name: m.name,
      color: getMarkerKindConfig(m.kind).accent,
    },
    geometry: { type: 'Point', coordinates: [m.lon, m.lat] },
  }));
  return { type: 'FeatureCollection', features: [...dcFeatures, ...markerFeatures] };
}

/** Hit-tested feature properties → a DataCenterPoint from the bundle. */
function bundledDataCenter(ref: unknown): DataCenterPoint | null {
  const i = Number(ref);
  if (!Number.isInteger(i) || i < 0 || i >= BUNDLED_DATA_CENTERS.length) return null;
  const d = BUNDLED_DATA_CENTERS[i];
  return {
    id: `dc-${i}`,
    name: d.name,
    operator: d.operator,
    lat: d.lat,
    lon: d.lon,
  };
}

const OSM_SOURCE = 'osm';

/** The graticule source, for zoom-adaptive placeholder updates. */
function gridSource(map: MaplibreMap): GeoJSONSource | null {
  const source = map.getSource('grid');
  return source instanceof GeoJSONSource ? source : null;
}

/** OSM layers, added on top of the grid once the tile server answers. */
const osmLayers: StyleSpecification['layers'] = [
  {
    id: 'water',
    type: 'fill',
    source: OSM_SOURCE,
    'source-layer': 'water',
    paint: { 'fill-color': '#0a2233' },
  },
  {
    id: 'waterway',
    type: 'line',
    source: OSM_SOURCE,
    'source-layer': 'waterway',
    paint: { 'line-color': '#0a2233', 'line-width': 1.5 },
  },
  {
    id: 'landcover-wood',
    type: 'fill',
    source: OSM_SOURCE,
    'source-layer': 'landcover',
    filter: ['==', ['get', 'class'], 'wood'],
    paint: { 'fill-color': '#0d1810' },
  },
  {
    id: 'landuse-park',
    type: 'fill',
    source: OSM_SOURCE,
    'source-layer': 'park',
    paint: { 'fill-color': '#0e1a12' },
  },
  {
    id: 'building',
    type: 'fill',
    source: OSM_SOURCE,
    'source-layer': 'building',
    paint: { 'fill-color': '#141f28', 'fill-outline-color': '#1b2833' },
  },
  {
    id: 'road-minor',
    type: 'line',
    source: OSM_SOURCE,
    'source-layer': 'transportation',
    filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'path']]],
    paint: { 'line-color': '#1c2c38', 'line-width': 0.8 },
  },
  {
    id: 'road-secondary',
    type: 'line',
    source: OSM_SOURCE,
    'source-layer': 'transportation',
    filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
    paint: { 'line-color': '#2a4152', 'line-width': 1.2 },
  },
  {
    id: 'road-major',
    type: 'line',
    source: OSM_SOURCE,
    'source-layer': 'transportation',
    filter: ['in', ['get', 'class'], ['literal', ['primary', 'trunk', 'motorway']]],
    paint: { 'line-color': '#3d5d73', 'line-width': 1.8 },
  },
  {
    id: 'boundary-country',
    type: 'line',
    source: OSM_SOURCE,
    'source-layer': 'boundary',
    filter: ['==', ['get', 'admin_level'], 2],
    paint: { 'line-color': '#75dce6', 'line-opacity': 0.35, 'line-width': 1 },
  },
  {
    id: 'place-city-label',
    type: 'symbol',
    source: OSM_SOURCE,
    'source-layer': 'place',
    filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
    },
    paint: { 'text-color': '#c5d3d9', 'text-halo-color': '#05090d', 'text-halo-width': 1.5 },
  },
];

/** Whatever the 3D side and the popups need, readable from the
 *  imperative layers (rAF loop + pointer handlers) without rebinding. */
interface StreetInputs {
  mode: ViewportMode;
  ghost: GhostMarkerView | null;
  pendingLabel: string;
  relocatingId: string | null;
  popupId: string | null;
  markers: PlacedMarkerView[];
  onSurfaceClick: (latLon: LatLon) => void;
  onSurfaceHover?: (latLon: LatLon) => void;
  onMarkerSelect: (id: string) => void;
  onMarkerRelocate: (id: string) => void;
  onMarkerRemove: (id: string) => void;
  onCancelRelocate: () => void;
  onDataCenterSelect?: (point: DataCenterPoint) => void;
}

/**
 * Street-level layer under the globe: one MapLibre map that cross-fades
 * with the 3D scene as the camera descends, so zooming in from orbit
 * reads as a single continuous motion into the street map. Zooming back
 * out keeps the street view solid well past the descent threshold and
 * unrenders it from the edges in (radial mask) before the globe shows.
 *
 * The globe's orbit controls stay the single input surface (the map is
 * non-interactive; the world-canvas listens through the browser's bubble
 * phase): once the map owns the view (@see STREET_FADE_ACTIVE), a
 * stationary click hit-tests the facility dots (select, popup with
 * move/remove) or places/moves at the projected position, exactly
 * mirroring globe-mode behavior. Rotate = pan at street level; drag
 * sensitivity is altitude-adaptive (see Globe IdleSpin) so one pixel of
 * drag moves about one pixel of map.
 *
 * Where real tiles are missing (outside Europe, or while the archive
 * builds) the graticule grid shows.
 */
export default function StreetLevel({
  flyTarget,
  sceneWrapRef,
  markers,
  mode,
  ghost,
  pendingLabel,
  relocatingId,
  popupId,
  onSurfaceClick,
  onSurfaceHover,
  onMarkerSelect,
  onMarkerRelocate,
  onMarkerRemove,
  onCancelRelocate,
  onDataCenterSelect,
}: StreetLevelProps) {
  /** The `.street-level` wrapper — its opacity is the crossfade volume;
   *  the CSS keeps it at 0 until this loop drives it per frame. */
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  /** DOM ghost preview + street popup (positioned imperatively). */
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  /** Latest props snapshot for the imperative layer (see StreetInputs). */
  const inputsRef = useRef<StreetInputs | null>(null);
  useEffect(() => {
    inputsRef.current = {
      mode,
      ghost,
      pendingLabel,
      relocatingId,
      popupId,
      markers,
      onSurfaceClick,
      onSurfaceHover,
      onMarkerSelect,
      onMarkerRelocate,
      onMarkerRemove,
      onCancelRelocate,
      onDataCenterSelect,
    };
  });
  /** While true the map holds its prewarm view instead of following the
   *  (still far away) camera; cleared the moment the crossfade begins. */
  const prewarmedRef = useRef(false);
  const fadeRef = useRef(0);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const map = new MaplibreMap({
      container: host,
      style: baseStyle(),
      center: [0, 0],
      zoom: 1.5,
      attributionControl: false,
      interactive: false,
    });
    mapRef.current = map;

    // Success/failure breadcrumbs so a blank map is diagnosable from
    // the console (each stage logs when it completes, not only on error).
    map.on('error', (event) => {
      console.warn('[street-level] maplibre error:', event.error?.message ?? event);
    });
    map.on('load', () => {
      console.info('[street-level] map loaded — placeholder grid is live');
    });

    // Resolve the tile server (own archive when reachable, public
    // OpenFreeMap otherwise); only a resolved URL upgrades the map with
    // the OSM source (a dead source in the initial style would stall the
    // whole style — see baseStyle comment).
    resolveTilesUrl()
      .then((tilesUrl) => {
        setOnline(true);
        const addOsm = () => {
          if (mapRef.current !== map || map.getSource(OSM_SOURCE)) return;
          map.addSource(OSM_SOURCE, { type: 'vector', url: tilesUrl });
          for (const layer of osmLayers) map.addLayer(layer);
          // OSM fills (water/landuse/building) are opaque — re-hoist the
          // facility dots + labels above them, or they get buried.
          map.moveLayer('facilities-dot');
          map.moveLayer('facilities-label');
          // Real tiles cover the chart — drop any street-zoom densification.
          gridSource(map)?.setData(graticule(GRID_START_STEP));
          console.info('[street-level] OSM source + layers added — real tiles live');
        };
        if (map.loaded()) addOsm();
        else map.once('load', addOsm);
      })
      .catch((err: unknown) => {
        setOnline(false);
        console.info(
          '[street-level] tile server unreachable — placeholder grid only:',
          err instanceof Error ? err.message : err,
        );
      });

    // Last applied view, so idle frames don't fight MapLibre internals.
    let lastLon = NaN;
    let lastLat = NaN;
    let lastZoom = NaN;
    let gridStep = GRID_START_STEP;
    let crossfadeAnnounced = false;
    // Only touch the DOM when a value actually changes: rewriting the
    // same opacity/mask string every rAF frame (the map mirrors a
    // continuously-rendered 3D scene) force-re-rasterizes the masked
    // layer each frame and burns a full CPU core even when nothing moves.
    let lastFadeKey = -1;
    let lastFadePct = -1;
    let lastScenePct = -1;
    let maskKey = '';
    let lastPopupKey = '';
    let wrapSize = { w: 0, h: 0 };
    let sizeDirty = true;
    const wrapResize = () => {
      sizeDirty = true;
    };
    const sizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(wrapResize) : null;
    if (sizeObserver) sizeObserver.observe(host);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const current = mapRef.current;
      const inputs = inputsRef.current;
      if (!current || !hostRef.current || !inputs) return;

      const pos = cameraTelemetry.position;
      const { lat, lon } = vector3ToLatLon(pos);
      const zoom = zoomForCamera(pos.length(), lat, hostRef.current.clientHeight);
      const fade = smoothstep(FADE_ZOOM_START, FADE_ZOOM_END, zoom);
      fadeRef.current = fade;
      cameraTelemetry.streetFade = fade;

      // Crossfade: the street map fades in over the globe scene — past
      // FADE_ZOOM_END it stays fully solid while you zoom deeper, and on
      // the way out it only starts fading at FADE_ZOOM_END with its
      // edges peeling first (applyStreetMask). Writes are change-guarded
      // (see above) — continuous style writes would re-raster-per-frame.
      if (wrapRef.current) {
        const fadePct = Math.round(fade * 1000) / 1000;
        if (fadePct !== lastFadePct) {
          lastFadePct = fadePct;
          wrapRef.current.style.opacity = fadePct.toFixed(3);
        }
        // The mask gradient depends only on (fade, wrap size) — rebuild
        // the string key first, touch the DOM only on real changes.
        if (sizeDirty || fade !== lastFadeKey) {
          lastFadeKey = fade;
          wrapSize = sizeObserver ? { w: wrapRef.current.clientWidth, h: wrapRef.current.clientHeight } : wrapRef.current.getBoundingClientRect().toJSON();
          sizeDirty = false;
          const radius = 12 + Math.hypot(wrapSize.w, wrapSize.h) * 0.75 * fade;
          const gradient =
            fade >= 1
              ? 'none'
              : `radial-gradient(circle ${radius.toFixed(0)}px at 50% 50%, #000 70%, transparent 100%)`;
          if (gradient !== maskKey) {
            maskKey = gradient;
            applyStreetMask(wrapRef.current, gradient);
          }
        }
      }
      if (sceneWrapRef.current) {
        const scenePct = Math.round((1 - fade) * 1000) / 1000;
        if (scenePct !== lastScenePct) {
          lastScenePct = scenePct;
          sceneWrapRef.current.style.opacity = scenePct.toFixed(3);
        }
      }

      if (fade > 0.02) {
        prewarmedRef.current = false; // camera takes over from prewarm
        if (!crossfadeAnnounced) {
          crossfadeAnnounced = true;
          console.info(
            `[street-level] crossfade engaged at map-zoom ${zoom.toFixed(2)} (${lat.toFixed(2)}, ${lon.toFixed(2)})`,
          );
        }
        if (lon !== lastLon || lat !== lastLat || zoom !== lastZoom) {
          current.jumpTo({ center: [lon, lat], zoom });
          lastLon = lon;
          lastLat = lat;
          lastZoom = zoom;
        }
        // Placeholder mode (no real tiles): keep the graticule dense
        // enough that lines actually cross the viewport at this zoom.
        const step = graticuleStepForZoom(zoom);
        if (!current.getSource(OSM_SOURCE) && step !== gridStep) {
          gridStep = step;
          gridSource(current)?.setData(graticule(step));
        }
      } else if (crossfadeAnnounced && fade === 0) {
        crossfadeAnnounced = false;
      }

      // Street popup follows its facility while the map moves.
      const popup = popupRef.current;
      if (popup) {
        const marker =
          inputs.popupId && fade >= 0.5
            ? inputs.markers.find((m) => m.id === inputs.popupId)
            : undefined;
        let popupKey = '';
        if (marker) {
          const pt = current.project([marker.lon, marker.lat]);
          popupKey = `${pt.x.toFixed(1)}|${pt.y.toFixed(1)}`;
          if (popupKey !== lastPopupKey) {
            lastPopupKey = popupKey;
            popup.style.transform = `translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px)`;
          }
          popup.style.visibility = 'visible';
        } else if (popup.style.visibility !== 'hidden') {
          popup.style.visibility = 'hidden';
        }
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      sizeObserver?.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [sceneWrapRef]);

  // Street input layer: the R3F canvas is the event target at street
  // level too (the street wrapper is pointer-events:none) — listen on
  // its container in the bubble phase and route clicks/ghost there.
  useEffect(() => {
  const surface = wrapRef.current?.parentElement; // `.globe-canvas`
  if (!surface) return;

  const press = { x: 0, y: 0, active: false };
  const lastHover = { time: 0, x: 0, y: 0 };
    const onPointerDown = (e: PointerEvent) => {
      press.active = e.target instanceof Element && e.target.tagName === 'CANVAS';
      press.x = e.clientX;
      press.y = e.clientY;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fadeRef.current >= STREET_FADE_ACTIVE) {
        const inputs = inputsRef.current;
        if (ghostRef.current) ghostRef.current.style.display = 'none';
        if (inputs && inputs.mode !== 'idle') inputs.onCancelRelocate();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const inputs = inputsRef.current;
      const ghostEl = ghostRef.current;
      if (!inputs || !ghostEl) return;
      // Ghost + outlook only exist while placing/moving and the map is
      // visibly in charge; above the band the 3D ghost takes over.
      if (inputs.mode === 'idle' || !inputs.ghost || fadeRef.current < STREET_FADE_ACTIVE) {
        ghostEl.style.display = 'none';
        return;
      }
      const rect = surface.getBoundingClientRect();
      ghostEl.style.display = 'block';
      ghostEl.style.transform = `translate(${(e.clientX - rect.left).toFixed(0)}px, ${(e.clientY - rect.top).toFixed(0)}px)`;
      // Throttled outlook feed (same contract as the 3D ghost hover).
      const now = performance.now();
      if (inputs.onSurfaceHover && now - lastHover.time >= 400 &&
          Math.hypot(e.clientX - lastHover.x, e.clientY - lastHover.y) >= 24) {
        lastHover.time = now;
        lastHover.x = e.clientX;
        lastHover.y = e.clientY;
        const map = mapRef.current;
        if (map && hostRef.current) {
          const hostRect = hostRef.current.getBoundingClientRect();
          const ll = map.unproject([
            e.clientX - hostRect.left,
            e.clientY - hostRect.top,
          ]);
          inputs.onSurfaceHover({ lat: ll.lat, lon: ll.lng });
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasPress = press.active;
      press.active = false;
      const inputs = inputsRef.current;
      const map = mapRef.current;
      if (!wasPress || !inputs || !map || !hostRef.current) return;
      // Only stationary presses are clicks; drags were orbit/pan gestures.
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLOP_PX) return;
      // The 3D scene owns inputs while it is (partly) visible.
      if (fadeRef.current < STREET_FADE_ACTIVE) return;
      const rect = hostRef.current.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (px < 0 || py < 0 || px >= rect.width || py >= rect.height) return;

      // Facility hit-test first — mirrors globe mode, where clicking a
      // marker head selects/opens the popup instead of placing.
      try {
        const hits = map.queryRenderedFeatures([px, py], {
          layers: ['facilities-dot', 'facilities-label'],
        });
        const feature = hits[0];
        if (feature) {
          const { ref, kind } = feature.properties ?? {};
          if (kind === 'user' && typeof ref === 'string') {
            inputs.onMarkerSelect(ref);
            return;
          }
          if (kind === 'dc') {
            const dc = bundledDataCenter(ref);
            if (dc && inputs.onDataCenterSelect) {
              inputs.onDataCenterSelect(dc);
              return;
            }
          }
        }
      } catch {
        // Layers can be missing pre-style-load — fall through to surface.
      }

      const ll = map.unproject([px, py]);
      inputs.onSurfaceClick({ lat: ll.lat, lon: ll.lng });
    };

    surface.addEventListener('pointerdown', onPointerDown);
    surface.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      surface.removeEventListener('pointerdown', onPointerDown);
      surface.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Prewarm: fetch the destination's street-level tiles immediately, so
  // they are ready when the fly-to crosses into the crossfade band.
  // Targets outside the tile archive (non-European) never cross it.
  useEffect(() => {
    if (!flyTarget || !flyTarget.street || !mapRef.current) return;
    mapRef.current.jumpTo({ center: [flyTarget.lon, flyTarget.lat], zoom: PREWARM_ZOOM });
    prewarmedRef.current = true;
  }, [flyTarget]);

  // Facilities on the street map: refresh the dots whenever placements
  // change (bundled data centers are static and always included).
  useEffect(() => {
    const source = mapRef.current?.getSource('facilities') as GeoJSONSource | undefined;
    source?.setData(facilitiesGeoJson(markers));
  }, [markers]);

  // Street popup: only for user placements (bundled DCs show their
  // profile in the inspector instead), exactly like globe mode.
  const popupMarker = popupId ? markers.find((m) => m.id === popupId) : undefined;
  const relocatingPopup = popupMarker && popupMarker.id === relocatingId;

  return (
    <div className="street-level" ref={wrapRef}>
      <div ref={hostRef} className="street-level__map" />

      {(mode !== 'idle' && ghost) && (
        <div className="street-ghost" ref={ghostRef} style={{ display: 'none' }}>
          <span
            className="street-ghost__dot"
            style={{ background: ghost.color, borderColor: ghost.color }}
          />
          <span className="street-ghost__label">{pendingLabel}</span>
        </div>
      )}

      {popupMarker && (
        <div className="street-popup" ref={popupRef}>
          <div
            className="marker-popup"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <span className="marker-popup__name">{popupMarker.name}</span>
            {relocatingPopup ? (
              <button
                type="button"
                className="marker-popup__action"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelRelocate();
                }}
              >
                × Cancel Move
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="marker-popup__action"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkerRelocate(popupMarker.id);
                  }}
                >
                  ↗ Relocate
                </button>
                <button
                  type="button"
                  className="marker-popup__action marker-popup__action--remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkerRemove(popupMarker.id);
                  }}
                >
                  − Remove
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <span className="street-level__status">
        {online === null
          ? 'CONNECTING TILE SERVER…'
          : online
            ? 'OPENSTREETMAP · MINIPC TILES'
            : 'PLACEHOLDER GRID · TILES BUILDING'}
      </span>
    </div>
  );
}
