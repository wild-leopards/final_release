import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import type { MarkerKind } from '../../lib/simulation';
import type { LatLon } from '../../lib/geo';
import { raySphereHit, vector3ToLatLon } from '../../lib/geo3d';
import { cameraTelemetry, STREET_FADE_ACTIVE } from '../../lib/cameraTelemetry';
import { MarkerHead, markerScaleForAltitude } from './Markers';

/** What the ghost preview should render and in which hue. */
export interface GhostMarkerView {
  kind: MarkerKind;
  color: string;
}

const Z_AXIS = new Vector3(0, 0, 1);
// Reused across frames to avoid per-frame allocations (single ghost).
const scratchNormal = new Vector3();

/**
 * Semi-transparent preview of the object that follows the cursor over
 * the globe surface while placing or relocating. Purely imperative:
 * each frame it raycasts the earth mesh and moves itself, so pointer
 * movement never triggers React re-renders. The cursor position is
 * reported upward (throttled, on significant move) so placement mode
 * can show a live site-outlook line.
 */
const HOVER_MIN_INTERVAL_S = 0.5;
const HOVER_MIN_MOVE_DEG = 2;

export default function GhostMarker({
  ghost,
  onHover,
}: {
  ghost: GhostMarkerView | null;
  /** Cursor site over the globe, at most ~2×/s while it moves. */
  onHover?: (latLon: LatLon) => void;
}) {
  const groupRef = useRef<Group | null>(null);
  const ringRef = useRef<Mesh<never, MeshBasicMaterial> | null>(null);
  const lastHoverRef = useRef<{ time: number; lat: number; lon: number } | null>(null);
  const { camera, pointer, raycaster } = useThree();

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;

    const streetsOwnView = cameraTelemetry.streetFade >= STREET_FADE_ACTIVE;
    let hitPosition: Vector3 | null = null;
    if (!streetsOwnView && ghost) {
      raycaster.setFromCamera(pointer, camera);
      // Analytic unit-sphere hit — the visible mesh's facets sag ~12 km
      // and would smear the ghost + outlook code off the street map.
      const hit = raySphereHit(raycaster.ray);
      if (hit) hitPosition = hit.clone(); // scratch is shared; copy it
    }

    if (!hitPosition || streetsOwnView) {
      group.visible = false;
      return;
    }
    group.visible = true;

    if (onHover) {
      // The street layer reports its own hover (projected onto the map)
      // once the map owns the view — don't double-report.
      if (cameraTelemetry.streetFade >= STREET_FADE_ACTIVE) return;
      const site = vector3ToLatLon(hitPosition);
      const last = lastHoverRef.current;
      const now = clock.elapsedTime;
      const due = !last || now - last.time >= HOVER_MIN_INTERVAL_S;
      const movedEnough =
        !last ||
        Math.abs(site.lat - last.lat) >= HOVER_MIN_MOVE_DEG ||
        Math.abs(site.lon - last.lon) >= HOVER_MIN_MOVE_DEG;
      if (due && movedEnough) {
        lastHoverRef.current = { time: now, lat: site.lat, lon: site.lon };
        onHover(site);
      }
    }

    scratchNormal.copy(hitPosition).normalize();
    group.position.copy(hitPosition).addScaledVector(scratchNormal, 0.004);
    group.quaternion.setFromUnitVectors(Z_AXIS, scratchNormal);
    // Match the real markers' descend-shrink (see Markers.tsx).
    group.scale.setScalar(markerScaleForAltitude(camera.position.length() - 1));

    const ring = ringRef.current;
    if (ring) {
      const t = clock.elapsedTime * 2.4;
      ring.scale.setScalar(1 + 0.25 * Math.sin(t));
      ring.material.opacity = 0.55 - 0.3 * Math.abs(Math.sin(t));
    }
  });

  if (!ghost) return null;
  const { kind, color } = ghost;

  return (
    <group ref={groupRef} visible={false}>
      {/* Ghost head: same silhouette as the real marker */}
      <mesh position={[0, 0, 0.05]} raycast={() => null}>
        <MarkerHead kind={kind} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>

      {/* Spike */}
      <mesh position={[0, 0, 0.025]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.003, 0.003, 0.05, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>

      {/* Pulsing drop ring */}
      <mesh ref={ringRef} raycast={() => null}>
        <ringGeometry args={[0.03, 0.042, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.45}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}
