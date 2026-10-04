import { useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { type InstancedMesh, type MeshBasicMaterial, Object3D } from 'three';
import { latLonToVector3 } from '../../lib/geo3d';
import {
  fetchOsmDataCenters,
  estimateFor,
  type DataCenterPoint,
} from '../../lib/osm/dataCenters';

const ACCENT = '#42d7e8';
const DOT_RADIUS = 0.0045;

export type DataCenterStatus = {
  state: 'loading' | 'ready' | 'error';
  count: number;
};

interface DataCenterDotsProps {
  visible: boolean;
  /** Reports fetch progress so the UI toggle can show a badge. */
  onStatus?: (status: DataCenterStatus) => void;
  /** Fires when a dot is clicked: show its profile in the inspector. */
  onSelect?: (point: DataCenterPoint) => void;
}

/**
 * "All data centers" layer: every OSM-tagged data centre worldwide,
 * drawn as one instanced mesh (a single draw call for thousands of
 * dots). Hover resolves the instance under the cursor to its name.
 */
export default function DataCenterDots({ visible, onStatus, onSelect }: DataCenterDotsProps) {
  const [points, setPoints] = useState<DataCenterPoint[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState<DataCenterPoint | null>(null);
  const meshRef = useRef<InstancedMesh>(null);

  useEffect(() => {
    if (!visible || points || failed) return;
    let cancelled = false;
    onStatus?.({ state: 'loading', count: 0 });
    fetchOsmDataCenters()
      .then((rows) => {
        if (cancelled) return;
        setPoints(rows);
        if (rows.length === 0) setFailed(true);
        onStatus?.({ state: rows.length > 0 ? 'ready' : 'error', count: rows.length });
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        onStatus?.({ state: 'error', count: 0 });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, points, failed]);

  // IMPORTANT: memoized so R3F does NOT rebuild the InstancedMesh on
  // every parent re-render — a rebuild resets instance matrices and all
  // dots collapse to the origin (invisible inside the globe).
  const meshArgs = useMemo<[undefined, undefined, number]>(
    () => [undefined, undefined, points?.length ?? 0],
    [points?.length],
  );

  // Pack all dots into the InstancedMesh once per data load — and again
  // whenever the layer is re-shown: toggling `visible` unmounts the mesh,
  // and the fresh instance it remounts with starts from identity
  // matrices, so they must be re-applied.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!visible || !mesh || !points || points.length === 0) return;
    const dummy = new Object3D();
    points.forEach((p, i) => {
      dummy.position.copy(latLonToVector3({ lat: p.lat, lon: p.lon }, 1.003));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [points, visible]);

  // Gentle opacity pulse so the layer reads as "live infrastructure".
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    (mesh.material as MeshBasicMaterial).opacity =
      0.55 + 0.25 * (1 + Math.sin(clock.elapsedTime * 2.2)) * 0.5;
  });

  if (!visible || !points || points.length === 0) return null;

  const estimate = hovered ? estimateFor(hovered) : null;

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={meshArgs}
        frustumCulled={false}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (e.instanceId != null && points[e.instanceId]) {
            setHovered(points[e.instanceId]);
            document.body.style.cursor = 'pointer';
          }
        }}
        onClick={(e) => {
          e.stopPropagation(); // don't drop a placement marker through the dot
          if (e.instanceId != null && points[e.instanceId]) {
            onSelect?.(points[e.instanceId]);
          }
        }}
        onPointerOut={() => {
          setHovered(null);
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[DOT_RADIUS, 8, 8]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.7} />
      </instancedMesh>

      {hovered && (
        <Html
          position={latLonToVector3({ lat: hovered.lat, lon: hovered.lon }, 1.003)}
          style={{ pointerEvents: 'none' }}
          zIndexRange={[30, 20]}
          wrapperClass="threat-tip-wrapper"
        >
          <div className="threat-tip threat-tip--dc">
            <strong>{hovered.name}</strong>
            {hovered.operator && <span>Operator: {hovered.operator}</span>}
            <span className="threat-tip__real">
              ✓ {estimate?.gridIntensity} gCO₂e/kWh grid
            </span>
            <span>
              ≈{estimate?.capacityMw} MW IT · PUE {estimate?.pue}
            </span>
            <span>
              ≈{estimate?.energyGwh.toFixed(0)} GWh/yr ·{' '}
              {estimate?.co2Kt.toFixed(0)} kt CO₂e/yr
            </span>
          </div>
        </Html>
      )}

      {/* Highlight halo around the hovered instance */}
      {hovered && (
        <mesh
          key={hovered.id}
          position={latLonToVector3({ lat: hovered.lat, lon: hovered.lon }, 1.005)}
        >
          <sphereGeometry args={[DOT_RADIUS * 2.4, 12, 12]} />
          <meshBasicMaterial color={ACCENT} transparent opacity={0.35} />
        </mesh>
      )}
    </group>
  );
}
