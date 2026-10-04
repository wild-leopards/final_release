import { Suspense, useEffect, useMemo, useRef } from 'react';
import { BackSide, AdditiveBlending, SRGBColorSpace, TextureLoader, type Mesh } from 'three';
import dayTexture from '../../assets/textures/earth/earth-blue-marble.jpg';
// Bump map: lossless PNG was 378 KB for a grayscale 2048 px map; WebP
// stores the same single-channel data at 51 KB.
import topologyTexture from '../../assets/textures/earth/earth-topology.webp';
import nightTexture from '../../assets/textures/earth/earth-night.jpg';
import type { LatLon } from '../../lib/geo';
import { raySphereHit, vector3ToLatLon } from '../../lib/geo3d';
import { cameraTelemetry, STREET_FADE_ACTIVE } from '../../lib/cameraTelemetry';
import Markers, { type PlacedMarkerView } from './Markers';
import GhostMarker, { type GhostMarkerView } from './GhostMarker';

interface EarthProps {
  markers: PlacedMarkerView[];
  selectedId: string | null;
  placementMode: boolean;
  relocatingId: string | null;
  /** Marker whose action popup is open (direct click only). */
  popupId: string | null;
  ghost: GhostMarkerView | null;
  onSurfaceClick: (latLon: LatLon) => void;
  /** Throttled cursor site while placing/relocating (drives the
   *  placement-mode outlook line). */
  onSurfaceHover?: (latLon: LatLon) => void;
  onMarkerSelect: (id: string) => void;
  onMarkerRelocate: (id: string) => void;
  onMarkerRemove: (id: string) => void;
  onCancelRelocate: () => void;
}

/** Pointer travel (px) below which a press counts as a click, not an
 *  orbit drag — drags rotate the planet and must never drop an object. */
const CLICK_SLOP_PX = 6;

/** The textured Earth sphere itself (loaded inside <Suspense> below). */
function EarthSphere({
  surfaceRef,
  onSurfaceClick,
}: {
  surfaceRef: React.RefObject<Mesh | null>;
  onSurfaceClick: (latLon: LatLon) => void;
}) {
  // Textures are created once and configured at construction time
  // (color maps need sRGB for correct colors); disposed on unmount.
  const { dayMap, bumpMap, nightMap } = useMemo(() => {
    const loader = new TextureLoader();
    const day = loader.load(dayTexture);
    day.colorSpace = SRGBColorSpace;
    const bump = loader.load(topologyTexture);
    const night = loader.load(nightTexture);
    night.colorSpace = SRGBColorSpace;
    return { dayMap: day, bumpMap: bump, nightMap: night };
    // Imported asset URLs are static constants, safe to load once.
  }, []);

  useEffect(
    () => () => {
      dayMap.dispose();
      bumpMap.dispose();
      nightMap.dispose();
    },
    [dayMap, bumpMap, nightMap],
  );

  // Where the current press started, to tell clicks from orbit drags.
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <mesh
      ref={surfaceRef}
      onPointerDown={(event) => {
        pressRef.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={(event) => {
        event.stopPropagation();
        // At street zoom the MapLibre map owns the pixels (the 3D scene
        // is faded out but still raycastable) — don't double-place.
        if (cameraTelemetry.streetFade >= STREET_FADE_ACTIVE) return;
        // Only a stationary press places/moves an object; a dragged
        // press was an orbit gesture and is ignored here.
        const press = pressRef.current;
        if (press) {
          const travel = Math.hypot(
            event.clientX - press.x,
            event.clientY - press.y,
          );
          if (travel > CLICK_SLOP_PX) return;
        }
        // Analytic sphere hit, never the faceted mesh point (its chord
        // planes sag up to ~12 km — thousands of px at street zoom).
        onSurfaceClick(
          vector3ToLatLon(raySphereHit(event.ray) ?? event.point),
        );
      }}
    >
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial
        map={dayMap}
        bumpMap={bumpMap}
        bumpScale={0.5}
        emissiveMap={nightMap}
        emissive="#ffd9a0"
        emissiveIntensity={0.35}
        roughness={0.85}
        metalness={0}
      />
    </mesh>
  );
}

/**
 * Earth owns the planet: textured sphere, thin atmosphere halo and the
 * infrastructure markers sitting on its surface. Clicks on the sphere are
 * translated to lat/lon and reported to the parent.
 */
export default function Earth({
  markers,
  selectedId,
  placementMode,
  relocatingId,
  popupId,
  ghost,
  onSurfaceClick,
  onSurfaceHover,
  onMarkerSelect,
  onMarkerRelocate,
  onMarkerRemove,
  onCancelRelocate,
}: EarthProps) {
  // Shared ref to the high-res surface mesh: ground truth for clicks and
  // the ghost raycast. Marker popups/labels use the cheap occluder below.
  const surfaceRef = useRef<Mesh | null>(null);
  const occluderRef = useRef<Mesh | null>(null);

  return (
    <Suspense fallback={null}>
      <EarthSphere surfaceRef={surfaceRef} onSurfaceClick={onSurfaceClick} />

      {/* Invisible low-poly sphere for DOM-overlay occlusion: the real
          earth mesh costs ~8k triangle tests per raycast per frame, this
          one ~0.5k. It has no event handlers, so R3F never hits it — and
          it must NOT override `raycast` here: drei's <Html occlude> does
          exactly this raycast against the mesh to test visibility, so a
          no-op raycast would make every popup permanently "visible"
          (floating over the planet's near side, still clickable). */}
      <mesh ref={occluderRef} visible={false}>
        <sphereGeometry args={[1, 16, 16]} />
      </mesh>

      {/* Thin atmosphere halo: slightly larger sphere rendered from the
          inside with additive blending — cheap but effective rim glow. */}
      <mesh scale={1.035}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial
          color="#4aa8ff"
          transparent
          opacity={0.12}
          side={BackSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <Markers
        markers={markers}
        selectedId={selectedId}
        highlight={placementMode}
        relocatingId={relocatingId}
        popupId={popupId}
        occluderRef={occluderRef}
        onSelect={onMarkerSelect}
        onRelocate={onMarkerRelocate}
        onRemove={onMarkerRemove}
        onCancelRelocate={onCancelRelocate}
      />

      {/* Cursor-following preview while placing/relocating */}
      <GhostMarker ghost={ghost} onHover={onSurfaceHover} />
    </Suspense>
  );
}
