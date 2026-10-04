import { useEffect, useMemo, useState } from 'react';
import { Html } from '@react-three/drei';
import { latLonToVector3 } from '../../lib/geo3d';
import {
  fetchGlobalTopSources,
  formatTonnes,
  TRACE_DATA_YEAR,
  type TraceThreat,
} from '../../lib/climatetrace/api';

/** Sector -> dot color, matching the dashboard's accent palette. */
const SECTOR_COLORS: Record<string, string> = {
  power: '#ff5d5d',
  'fossil-fuel-operations': '#f0a35e',
  'forestry-and-land-use': '#7ddba3',
  manufacturing: '#b18cff',
  transportation: '#42d7e8',
  mining: '#ffd166',
  agriculture: '#9ae66e',
  buildings: '#6ec6ff',
  waste: '#c9c9c9',
};

function sectorColor(sector?: string): string {
  return (sector && SECTOR_COLORS[sector]) || '#ff884d';
}

/** Log-scale dot radius: emissions range over ~2 orders of magnitude
 *  within the top 60, so linear sizing would make everything but the
 *  #1 source invisible. */
function dotRadius(emissionsT: number, minLog: number, maxLog: number): number {
  const t =
    (Math.log10(Math.max(emissionsT, 1)) - minLog) / Math.max(maxLog - minLog, 1);
  return 0.006 + 0.014 * Math.min(Math.max(t, 0), 1);
}

interface ThreatDotsProps {
  /** Whether the layer is toggled on. */
  visible: boolean;
  /** The selected threat (owned by App, profiled in the inspector). */
  selected: TraceThreat | null;
  /** Select/deselect a threat dot. */
  onSelect: (threat: TraceThreat | null) => void;
}

/**
 * "Biggest threats" layer: the world's largest individual emission
 * sources from Climate TRACE, drawn as dots pinned to their real
 * coordinates. Color = sector, size = emissions (log scale). Hovering
 * a dot names the facility and its annual CO₂e; clicking selects it,
 * which shows its profile in the inspector (no on-globe popup).
 */
export default function ThreatDots({
  visible,
  selected,
  onSelect,
}: ThreatDotsProps) {
  const [threats, setThreats] = useState<TraceThreat[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState<TraceThreat | null>(null);

  // A globe-viewport click dismisses the pinned card — but clicks in
  // the sidebars/header don't, so the inspector keeps showing the
  // profile while the user reads or scrolls the panels. Clicking a dot
  // also passes through here first; the dot's click event then (re)
  // opens its card, so switching dots just works. Measured on pointerUP
  // with a click-slop check so the START of an orbit drag doesn't fling
  // the card away mid-gesture (same 6px slop the surface click uses).
  useEffect(() => {
    if (!selected) return;
    let downX = 0;
    let downY = 0;
    const onPointerDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
    };
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLCanvasElement)) return;
      const travel =
        Math.abs(event.clientX - downX) + Math.abs(event.clientY - downY);
      if (travel > 6) return; // that was a drag, not a click
      onSelect(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', dismiss);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', dismiss);
    };
  }, [selected, onSelect]);

  useEffect(() => {
    if (!visible || threats || failed) return;
    let cancelled = false;
    fetchGlobalTopSources(TRACE_DATA_YEAR, 60)
      .then((rows) => {
        if (cancelled) return;
        setThreats(rows);
        setFailed(rows.length === 0);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, threats, failed]);

  // Log bounds for sizing, from the data actually shown.
  const [minLog, maxLog] = useMemo(() => {
    if (!threats || threats.length === 0) return [7, 9];
    const logs = threats.map((t) => Math.log10(Math.max(t.emissionsT, 1)));
    return [Math.min(...logs), Math.max(...logs)];
  }, [threats]);

  if (!visible || !threats) return null;

  return (
    <group>
      {threats.map((threat) => {
        const position = latLonToVector3(
          { lat: threat.lat, lon: threat.lon },
          1.004,
        );
        const radius = dotRadius(threat.emissionsT, minLog, maxLog);
        return (
          <mesh
            key={threat.id}
            position={position}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(threat);
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              setHovered((cur) => (cur === threat ? null : cur));
              document.body.style.cursor = 'auto';
            }}
            onClick={(e) => {
              e.stopPropagation(); // a dot click is not a surface click
              onSelect(threat);
            }}
          >
            <sphereGeometry args={[radius, 10, 10]} />
            <meshBasicMaterial color={sectorColor(threat.sector)} />
          </mesh>
        );
      })}

      {/* One stable screen-space tooltip for whichever dot is hovered
          (suppressed for the dot whose card is pinned). A single mounted
          instance (vs. Html inside each mesh) avoids remount flicker,
          and with no distanceFactor it keeps a fixed pixel size
          regardless of camera zoom. */}
      {hovered && hovered.id !== selected?.id && (
        <Html
          position={latLonToVector3({ lat: hovered.lat, lon: hovered.lon }, 1.004)}
          style={{ pointerEvents: 'none' }}
          zIndexRange={[30, 20]}
          wrapperClass="threat-tip-wrapper"
        >
          <div className="threat-tip">
            <strong>{hovered.name}</strong>
            <span>
              {formatTonnes(hovered.emissionsT)} CO₂e/yr
              {hovered.sector ? ` · ${hovered.sector.replace(/-/g, ' ')}` : ''}
              {hovered.country ? ` · ${hovered.country}` : ''}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}
