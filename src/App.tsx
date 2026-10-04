import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppHeader from './components/layout/AppHeader';
import GlobalHud from './components/hud/GlobalHud';
import RegionalInspector from './components/inspector/RegionalInspector';
import SimulationTimeline from './components/timeline/SimulationTimeline';
import type { IntroCommand } from './components/intro/IntroOverlay';
import {
  createMarker,
  enrichMarkerWithClimateTrace,
  enrichMarkerWithPower,
  getMarkerKindConfig,
  registerCustomKind,
  MARKER_KINDS,
  type MarkerKind,
  type MarkerKindConfig,
  type MarkerTraceContext,
  type OperationsProfile,
  type PlacedMarker,
} from './lib/simulation';
import {
  TIMELINE_START_YEAR,
  TIMELINE_END_TIME,
  TIMELINE_MONTHS,
  monthIndexOf,
  timeOfMonthIndex,
} from './lib/projection';
import type { LatLon, FlyTarget } from './lib/geo';
import { randomId } from './lib/id';
import type { DataCenterStatus } from './components/globe/DataCenterDots';
import type { DataCenterPoint } from './lib/osm/dataCenters';
import { outlookSummary } from './lib/suitability';
import type { TraceThreat } from './lib/climatetrace/api';
import type { CityEntry } from './lib/cities';
import { isEuropeanCity } from './lib/cities';
import { resolveTilesUrl } from './lib/basemap';

import type { ViewportMode } from './components/globe/GlobeViewport';

// Heavy stage loads after the shell paints: the viewport chunk pulls
// three/r3f/drei + maplibre, the intro chunk adds maplibre + gsap. Both
// stay covered by the pre-JS boot shell (index.html) so the shell →
// app handoff is invisible.
const GlobeViewport = lazy(() => import('./components/globe/GlobeViewport'));
const IntroOverlay = lazy(() => import('./components/intro/IntroOverlay'));

// Start the tile-server probe now, in parallel with the lazy chunks
// above, so it has usually settled before the intro map mounts.
void resolveTilesUrl();

import './styles/app.css';
import './styles/panels.css';
import './styles/intro.css';

/**
 * App shell: a monitoring-console frame around the dashboard grid.
 * Owns the simulation state (placed objects + selection); panels
 * and the globe are pure views over it.
 */
export default function App() {
  const [markers, setMarkers] = useState<PlacedMarker[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Timeline year the dashboard is projected to; drives the HUD,
   *  inspector and the facility lifecycle (markers exist from their
   *  placedYear onward). */
  const [year, setYear] = useState(TIMELINE_START_YEAR);
  const [playing, setPlaying] = useState(false);
  /** Kind chosen in the type picker; non-null == placement mode active. */
  const [pendingKind, setPendingKind] = useState<MarkerKind | null>(null);
  /** Marker being moved to a new site; non-null == relocation mode. */
  const [relocatingId, setRelocatingId] = useState<string | null>(null);
  /** Marker whose action popup is open; only a direct click opens it. */
  const [popupForId, setPopupForId] = useState<string | null>(null);
  /** Facilities the user defined via the custom picker entry. */
  const [customKinds, setCustomKinds] = useState<MarkerKindConfig[]>([]);
  /** City-search fly-to request; consumed by the globe camera and by
   *  StreetLevel to prewarm street tiles during the flight. */
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  /** Real Climate TRACE context per marker id (top facilities etc.). */
  const [traceContexts, setTraceContexts] = useState<Record<string, MarkerTraceContext>>({});
  /** Placement-mode outlook line for the cursor's country (throttled
   *  hover from the ghost preview; local data only, no network). */
  const [outlook, setOutlook] = useState<string | null>(null);
  /** Biggest-threat layer: world's largest real emitters on the globe. */
  const [showThreats, setShowThreats] = useState(true);
  /** Threat dot whose card is pinned and profile shown in the inspector.
   *  Mutually exclusive with the selected placed marker (last wins). */
  const [selectedThreat, setSelectedThreat] = useState<TraceThreat | null>(null);
  const handleToggleThreats = useCallback(() => {
    setShowThreats((v) => {
      if (v) setSelectedThreat(null); // hiding the layer clears its selection
      return !v;
    });
  }, []);
  const handleSelectThreat = useCallback((threat: TraceThreat | null) => {
    setSelectedThreat(threat);
    if (threat) {
      // A threat selection replaces any selected placed object.
      setSelectedId(null);
      setPopupForId(null);
    }
  }, []);
  /** All data centers layer: every OSM-tagged data centre on the globe. */
  const [showDataCenters, setShowDataCenters] = useState(true);
  const handleToggleDataCenters = useCallback(() => setShowDataCenters((v) => !v), []);
  const [dcStatus, setDcStatus] = useState<DataCenterStatus>({ state: 'loading', count: 0 });
  /** Data-center facility selected on the globe (inspector shows it). */
  const [selectedDc, setSelectedDc] = useState<DataCenterPoint | null>(null);
  const handleDataCenterSelect = useCallback((point: DataCenterPoint) => {
    setSelectedId(null);
    setPopupForId(null);
    setSelectedDc(point);
  }, []);
  const dcBadge =
    dcStatus.state === 'loading' ? '…'
      : dcStatus.state === 'error' ? '⚠'
        : '';
  /** Opening boot sequence: command channel + completion flag. */
  const [introCommand, setIntroCommand] = useState<IntroCommand | null>(null);
  const [introDone, setIntroDone] = useState(false);
  const handleGlobeCommand = useCallback((c: IntroCommand) => setIntroCommand(c), []);
  const handleIntroDone = useCallback(() => setIntroDone(true), []);

  const allKinds = useMemo(
    () => [...MARKER_KINDS, ...customKinds],
    [customKinds],
  );

  const getKindConfig = useCallback(
    (kind: MarkerKind): MarkerKindConfig =>
      customKinds.find((cfg) => cfg.kind === kind) ??
      getMarkerKindConfig(kind),
    [customKinds],
  );

  // ── Timeline playback ────────────────────────────────────────────
  // `year` is a fractional year with one position per month; playback
  // advances one month per tick and stops at Dec 2050.

  const handleScrub = useCallback((next: number) => {
    setPlaying(false);
    setYear(next);
  }, []);

  const handleTogglePlay = useCallback(() => {
    // Playing from the end restarts the whole timeline.
    if (!playing && year >= TIMELINE_END_TIME - 1e-6) setYear(TIMELINE_START_YEAR);
    setPlaying(!playing);
  }, [playing, year]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      const next = timeOfMonthIndex(Math.min(monthIndexOf(year) + 1, TIMELINE_MONTHS - 1));
      setYear(next);
      if (next >= TIMELINE_END_TIME - 1e-6) setPlaying(false);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [playing, year]);

  const handleCreateCustomKind = useCallback((config: MarkerKindConfig) => {
    // Register before state so the very first placement already resolves
    // the real capacity/accent everywhere (impact, outlook, street dots).
    registerCustomKind(config);
    setCustomKinds((prev) => [...prev, config]);
  }, []);

  const handlePickCity = useCallback((city: CityEntry) => {
    setFlyTarget({
      lat: city.lat,
      lon: city.lon,
      nonce: Date.now(),
      street: isEuropeanCity(city),
    });
  }, []);

  const handleEnterPlacement = useCallback((kind: MarkerKind) => {
    setRelocatingId(null);
    setPopupForId(null);
    setPendingKind(kind);
    setOutlook(null);
  }, []);

  const handleStartRelocate = useCallback((id: string) => {
    setPendingKind(null);
    setPopupForId(null);
    setRelocatingId(id);
    setOutlook(null);
  }, []);

  const handleCancelMode = useCallback(() => {
    setPendingKind(null);
    setRelocatingId(null);
    setPopupForId(null);
    setOutlook(null);
  }, []);

  /** Throttled cursor site during placement/relocation: compose the
   *  one-line outlook from the local country datasets (no POWER request
   *  per pointer move — real satellite weather attaches on click). */
  const handleSurfaceHover = useCallback(
    (latLon: LatLon) => {
      const kind =
        pendingKind ?? markers.find((m) => m.id === relocatingId)?.kind ?? null;
      setOutlook(kind ? outlookSummary(latLon, kind) : null);
    },
    [pendingKind, relocatingId, markers],
  );

  /** Clicking a marker selects it; the popup opens only when the same
   *  already-selected object is clicked again — except when it is the
   *  only object on the globe, where a single click toggles it. */
  const handleMarkerSelect = useCallback(
    (id: string) => {
      setSelectedDc(null);
      setSelectedThreat(null); // a marker selection replaces any threat
      setSelectedId(id);
      if (markers.length === 1) {
        // Single object: one click opens, a second click closes.
        setPopupForId((current) => (current === id ? null : id));
        return;
      }
      setPopupForId((current) => {
        if (current === id) return null; // popup open -> click closes it
        return selectedId === id ? id : null; // re-click on selected -> open
      });
    },
    [markers.length, selectedId],
  );

  /** Per-marker enrichment generation: bumped on every enrich call so a
   *  slow response for an older site (relocation fires a new chain for
   *  the same id) can never overwrite the newer one — chain A landing
   *  after chain B would otherwise teleport the marker back to site A. */
  const enrichTokens = useRef(new Map<string, number>());

  /** Kick off real-data enrichment for a marker and merge the result
   *  back into state when it arrives. Failures keep the heuristic
   *  numbers — placement never breaks on the network. Sequential on
   *  purpose: POWER must build on the TRACE-updated marker, or its
   *  baseline snapshot would clobber the TRACE fields when it lands
   *  last (both enrichers spread the baseline they were given). */
  const enrich = useCallback((placed: PlacedMarker) => {
    const token = (enrichTokens.current.get(placed.id) ?? 0) + 1;
    enrichTokens.current.set(placed.id, token);
    const isCurrent = () => enrichTokens.current.get(placed.id) === token;

    enrichMarkerWithClimateTrace(placed)
      .then(({ marker, context }) => {
        if (!isCurrent()) return; // superseded by a newer site/enrichment
        // Merge, don't replace wholesale: an in-flight enrichment must
        // never clobber a user edit (e.g. the scenario changed in the
        // inspector while the response was on the wire).
        setMarkers((prev) =>
          prev.map((m) => (m.id === marker.id ? { ...marker, operations: m.operations } : m)),
        );
        setTraceContexts((prev) => ({ ...prev, [marker.id]: context }));
        // Real NASA POWER weather/solar, on top of the TRACE baseline.
        return enrichMarkerWithPower(marker);
      })
      .then((marker) => {
        if (!marker || marker === placed || !isCurrent()) return; // failed or stale
        setMarkers((prev) =>
          prev.map((m) => (m.id === marker.id ? { ...marker, operations: m.operations } : m)),
        );
      })
      .catch(() => {
        if (!isCurrent()) return;
        setTraceContexts((prev) => ({
          ...prev,
          [placed.id]: { topSources: [], status: 'unavailable' },
        }));
      });
  }, []);

  const handleSurfaceClick = useCallback(
    (latLon: LatLon) => {
      // Any surface click closes an open popup / pinned threat card.
      setPopupForId(null);
      setSelectedThreat(null);
        // Relocation: drop the moving marker at the clicked site.
        if (relocatingId) {
          // New site -> new country context; rebuild and re-resolve.
          // Relocating re-founds the facility at the current timeline year
          // but keeps its operations scenario (a user-edited demand path
          // survives the move). Apply the rebuilt marker immediately, not
          // just lat/lon: when every network source is down (the designed
          // offline path) the old site's baseline would otherwise survive
          // the move forever, since enrichment only writes on success.
          const moved = markers.find((m) => m.id === relocatingId);
          if (moved) {
            const fresh = { ...createMarker(moved.id, moved.name, moved.kind, latLon, year),
              operations: moved.operations };
            setMarkers((prev) => prev.map((m) => (m.id === moved.id ? fresh : m)));
            enrich(fresh);
          }
          setRelocatingId(null);
          return;
        }
      // Empty-surface click (no mode active): deselect any DC profile.
      if (!pendingKind) {
        setSelectedDc(null);
        return;
      }
      const kindCount = markers.filter((m) => m.kind === pendingKind).length;
      const name = `${getKindConfig(pendingKind).label} ${String(
        kindCount + 1,
      ).padStart(2, '0')}`;
      // randomId: crypto.randomUUID() only exists in secure contexts —
      // placement must not die on plain-HTTP origins (minipc / -host).
      const marker = createMarker(randomId(), name, pendingKind, latLon, year);
      setMarkers((prev) => [...prev, marker]);
      setSelectedId(marker.id);
      setSelectedDc(null);
      setPendingKind(null);
      enrich(marker);
    },
    [pendingKind, relocatingId, markers, getKindConfig, enrich, year],
  );

  const handleRemoveMarker = useCallback(
    (id: string) => {
      setMarkers((prev) => prev.filter((m) => m.id !== id));
      setSelectedId((current) => (current === id ? null : current));
      setPopupForId((current) => (current === id ? null : current));
    },
    [],
  );

  /** Inspector scenario dropdown: switch a facility's demand-growth
   *  profile; the preset's rate ships with the scenario. */
  const handleOperationsChange = useCallback((id: string, operations: OperationsProfile) => {
    setMarkers((prev) => prev.map((m) => (m.id === id ? { ...m, operations } : m)));
  }, []);

  const selected = markers.find((m) => m.id === selectedId) ?? null;
  const mode: ViewportMode =
    pendingKind !== null ? 'placing' : relocatingId !== null ? 'relocating' : 'idle';
  const pendingLabel =
    mode === 'placing' && pendingKind
      ? getKindConfig(pendingKind).label
      : mode === 'relocating'
        ? selected?.name ?? ''
        : '';

  /** Ghost preview: the shape that will drop at the cursor position. */
  const ghost = useMemo(() => {
    if (mode === 'placing' && pendingKind) {
      return { kind: pendingKind, color: getKindConfig(pendingKind).accent };
    }
    if (mode === 'relocating' && relocatingId) {
      const moving = markers.find((m) => m.id === relocatingId);
      if (moving) return { kind: moving.kind, color: getKindConfig(moving.kind).accent };
    }
    return null;
  }, [mode, pendingKind, relocatingId, markers, getKindConfig]);

  return (
    <div className="app-frame">
      {!introDone && (
        <Suspense fallback={null}>
          <IntroOverlay onGlobeCommand={handleGlobeCommand} onDone={handleIntroDone} />
        </Suspense>
      )}
      <AppHeader onPickCity={handlePickCity} />
      <main className="app-main">
        <GlobalHud markers={markers} year={year} />
        <Suspense fallback={null}>
          <GlobeViewport
            markers={markers}
            selectedId={selectedId}
            mode={mode}
            relocatingId={relocatingId}
            flyTarget={flyTarget}
            introCommand={introCommand}
            popupId={popupForId}
            pendingLabel={pendingLabel}
            outlook={outlook}
            kinds={allKinds}
            ghost={ghost}
            showThreats={showThreats}
            selectedThreat={selectedThreat}
            onSelectThreat={handleSelectThreat}
            onToggleThreats={handleToggleThreats}
            showDataCenters={showDataCenters}
            onToggleDataCenters={handleToggleDataCenters}
            dcBadge={dcBadge}
            onDataCenterStatus={setDcStatus}
            onDataCenterSelect={handleDataCenterSelect}
            onEnterPlacement={handleEnterPlacement}
            onCancelMode={handleCancelMode}
            onCreateKind={handleCreateCustomKind}
            onSurfaceClick={handleSurfaceClick}
            onSurfaceHover={handleSurfaceHover}
            onMarkerSelect={handleMarkerSelect}
            onMarkerRelocate={handleStartRelocate}
            onMarkerRemove={handleRemoveMarker}
          />
        </Suspense>
        <RegionalInspector
          selected={selected}
          getKindConfig={getKindConfig}
          relocating={mode === 'relocating'}
          traceContext={selected ? traceContexts[selected.id] : undefined}
          selectedDc={selectedDc}
          threat={selectedThreat}
          year={year}
          markers={markers}
          onOperationsChange={handleOperationsChange}
        />
      </main>
      <SimulationTimeline
        year={year}
        playing={playing}
        onScrub={handleScrub}
        onTogglePlay={handleTogglePlay}
      />
    </div>
  );
}
