import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import AddObjectControl from './AddObjectControl';
import GlobeControlsHint from './GlobeControlsHint';
import type { TraceThreat } from '../../lib/climatetrace/api';
import type { LatLon, FlyTarget } from '../../lib/geo';
import type { DataCenterPoint } from '../../lib/osm/dataCenters';
import type { MarkerKind, MarkerKindConfig } from '../../lib/simulation';
import type { PlacedMarkerView } from './Markers';
import type { GhostMarkerView } from './GhostMarker';
import type { IntroCommand } from '../intro/IntroOverlay';

// The two render surfaces load as their own chunks after the shell
// paints (three/r3f/drei for the globe, maplibre for street level) —
// they fetch in parallel and evaluate as separate tasks instead of one
// multi-second block inside the entry bundle.
const Globe = lazy(() => import('./Globe'));
const StreetLevel = lazy(() => import('./StreetLevel'));

/** What the viewport is waiting for from the next globe click. */
export type ViewportMode = 'idle' | 'placing' | 'relocating';

interface GlobeViewportProps {
  markers: PlacedMarkerView[];
  selectedId: string | null;
  mode: ViewportMode;
  relocatingId: string | null;
  flyTarget: FlyTarget | null;
  introCommand: IntroCommand | null;
  popupId: string | null;
  pendingLabel: string;
  /** Live outlook line under the placement label (cursor country). */
  outlook?: string | null;
  kinds: readonly MarkerKindConfig[];
  ghost: GhostMarkerView | null;
  showThreats: boolean;
  /** Threat dot whose card is pinned (mirrored in the inspector). */
  selectedThreat: TraceThreat | null;
  onSelectThreat: (threat: TraceThreat | null) => void;
  onToggleThreats: () => void;
  showDataCenters: boolean;
  onToggleDataCenters: () => void;
  /** Fetch state of the OSM data-centre layer ('' when idle/ready). */
  dcBadge?: string;
  onDataCenterStatus?: (status: { state: 'loading' | 'ready' | 'error'; count: number }) => void;
  onDataCenterSelect?: (point: DataCenterPoint) => void;
  onEnterPlacement: (kind: MarkerKind) => void;
  onCancelMode: () => void;
  onCreateKind: (config: MarkerKindConfig) => void;
  onSurfaceClick: (latLon: LatLon) => void;
  /** Throttled cursor site while placing/relocating (outlook line). */
  onSurfaceHover?: (latLon: LatLon) => void;
  onMarkerSelect: (id: string) => void;
  onMarkerRelocate: (id: string) => void;
  onMarkerRemove: (id: string) => void;
}

/** Central panel: blue-framed viewport containing the 3D Earth scene. */
export default function GlobeViewport({
  markers,
  selectedId,
  mode,
  relocatingId,
  flyTarget,
  introCommand,
  popupId,
  pendingLabel,
  outlook,
  kinds,
  ghost,
  showThreats,
  selectedThreat,
  onSelectThreat,
  onToggleThreats,
  showDataCenters,
  onToggleDataCenters,
  dcBadge,
  onDataCenterStatus,
  onDataCenterSelect,
  onEnterPlacement,
  onCancelMode,
  onCreateKind,
  onSurfaceClick,
  onSurfaceHover,
  onMarkerSelect,
  onMarkerRelocate,
  onMarkerRemove,
}: GlobeViewportProps) {
  const busy = mode !== 'idle';
  /** Wraps the R3F canvas; StreetLevel fades it out on descent. */
  const sceneWrapRef = useRef<HTMLDivElement | null>(null);

  // Country gradient overlays, toggled from the LAYERS menu.
  const [showGridOverlay, setShowGridOverlay] = useState(true);
  const [showWaterOverlay, setShowWaterOverlay] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const layersRef = useRef<HTMLDivElement | null>(null);

  // LAYERS menu closes on outside click or ESC.
  useEffect(() => {
    if (!layersOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (layersRef.current && !layersRef.current.contains(event.target as Node)) {
        setLayersOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Text fields own their ESC (search dropdown dismissal) — don't
      // also yank the layers menu closed from under the user.
      const target = event.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      setLayersOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [layersOpen]);

  const layerCount =
    (showGridOverlay ? 1 : 0) + (showWaterOverlay ? 1 : 0);

  // ESC always cancels whichever mode is active — unless the key was
  // pressed inside a text field (the search box uses ESC to dismiss its
  // dropdown; that must not silently discard the pending placement).
  useEffect(() => {
    if (!busy) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      onCancelMode();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancelMode]);

  const title =
    mode === 'placing'
      ? `PLACEMENT MODE // SELECT A SITE FOR THE ${pendingLabel.toUpperCase()}`
      : mode === 'relocating'
        ? `RELOCATION MODE // PICK A NEW SITE FOR ${pendingLabel.toUpperCase()}`
        : 'ORBITAL PROJECTION // REAL-TIME';

  return (
    <section className="globe-viewport">
      <header className="viewport-title">
        <div className="viewport-title__row">
          <div>
            <h2>INTERACTIVE 3D EARTH VIEW</h2>
            <p>{title}</p>
          </div>
          <div className="viewport-title__toggles">
            <div className="layers-menu" ref={layersRef}>
              <button
                type="button"
                className={`threat-toggle${layerCount > 0 ? ' threat-toggle--dc' : ''}`}
                onClick={() => setLayersOpen((o) => !o)}
                title="Toggle country data overlays painted on the globe"
              >
                <span className="threat-toggle__dot" />
                LAYERS {layerCount > 0 ? `· ${layerCount}` : ''}
              </button>
              {layersOpen && (
                <div className="layers-menu__dropdown" role="menu" aria-label="Data layers">
                  <span className="layers-menu__heading">DATA OVERLAYS</span>
                  <label className="layers-menu__option">
                    <input
                      type="checkbox"
                      checked={showGridOverlay}
                      onChange={(e) => setShowGridOverlay(e.target.checked)}
                    />
                    <span
                      className="layers-menu__swatch"
                      style={{ background: 'linear-gradient(90deg,#5ac882,#e6dc64,#f0a346,#e6463c)' }}
                    />
                    <span className="layers-menu__text">
                      Grid carbon intensity
                      <small>Ember 2024 · gCO₂e/kWh by country</small>
                    </span>
                  </label>
                  <label className="layers-menu__option">
                    <input
                      type="checkbox"
                      checked={showWaterOverlay}
                      onChange={(e) => setShowWaterOverlay(e.target.checked)}
                    />
                    <span
                      className="layers-menu__swatch"
                      style={{ background: 'linear-gradient(90deg,#7ddba3,#ffd166,#ff5d5d)' }}
                    />
                    <span className="layers-menu__text">
                      Water stress
                      <small>WRI Aqueduct · baseline category 0–4</small>
                    </span>
                  </label>
                </div>
              )}
            </div>
            <button
              type="button"
              className={`threat-toggle${showDataCenters ? ' threat-toggle--dc' : ''}`}
              onClick={onToggleDataCenters}
              title="Toggle every OSM-tagged data centre on Earth"
            >
              <span className="threat-toggle__dot" />
              DATA CENTERS
              {dcBadge ? ` ${dcBadge}` : ''}
            </button>
            <button
              type="button"
              className={`threat-toggle${showThreats ? ' threat-toggle--on' : ''}`}
              onClick={onToggleThreats}
              title="Toggle the world's largest real emission sources (Climate TRACE)"
            >
              <span className="threat-toggle__dot" />
              BIGGEST THREATS
            </button>
          </div>
        </div>
      </header>

      {/* The 3D scene, layered over the street-level map: zooming in
          crossfades from the globe into the map (StreetLevel.tsx). The
          scene wrapper's opacity is driven by the camera altitude. */}
      <div className={`globe-canvas${busy ? ' globe-canvas--picking' : ''}`}>
        <Suspense fallback={null}>
          <StreetLevel
            flyTarget={flyTarget}
            sceneWrapRef={sceneWrapRef}
            markers={markers}
            mode={mode}
            ghost={ghost}
            pendingLabel={pendingLabel}
            relocatingId={relocatingId}
            popupId={popupId}
            onSurfaceClick={onSurfaceClick}
            onSurfaceHover={onSurfaceHover}
            onMarkerSelect={onMarkerSelect}
            onMarkerRelocate={onMarkerRelocate}
            onMarkerRemove={onMarkerRemove}
            onCancelRelocate={onCancelMode}
            onDataCenterSelect={onDataCenterSelect}
          />
        </Suspense>
        <div className="globe-canvas__scene" ref={sceneWrapRef}>
          <Suspense fallback={null}>
            <Globe
              markers={markers}
              selectedId={selectedId}
              placementMode={mode !== 'idle'}
              relocatingId={relocatingId}
              flyTarget={flyTarget}
              popupId={popupId}
              ghost={ghost}
              showThreats={showThreats}
              selectedThreat={selectedThreat}
              onSelectThreat={onSelectThreat}
              showDataCenters={showDataCenters}
              showGridOverlay={showGridOverlay}
              showWaterOverlay={showWaterOverlay}
              onDataCenterStatus={onDataCenterStatus}
              onDataCenterSelect={onDataCenterSelect}
              onSurfaceClick={onSurfaceClick}
              onSurfaceHover={onSurfaceHover}
              onMarkerSelect={onMarkerSelect}
              onMarkerRelocate={onMarkerRelocate}
              onMarkerRemove={onMarkerRemove}
              onCancelRelocate={onCancelMode}
              introCommand={introCommand}
            />
          </Suspense>
        </div>
      </div>

      <AddObjectControl
        kinds={kinds}
        mode={mode}
        pendingLabel={pendingLabel}
        outlook={outlook}
        onEnterPlacement={onEnterPlacement}
        onCancelMode={onCancelMode}
        onCreateKind={onCreateKind}
      />
      <GlobeControlsHint mode={mode} />
    </section>
  );
}
