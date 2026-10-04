import { useMemo, useRef, type RefObject } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { latLonToVector3 } from '../../lib/geo3d';
import type { MarkerKind } from '../../lib/simulation';
import { cameraTelemetry, STREET_FADE_ACTIVE } from '../../lib/cameraTelemetry';

/** What the 3D layer needs to know about a placed marker. */
export interface PlacedMarkerView {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: MarkerKind;
}

interface MarkersProps {
  markers: PlacedMarkerView[];
  selectedId: string | null;
  /** Pulse markers faster while the user is choosing a placement location. */
  highlight?: boolean;
  /** Marker currently being relocated (popup shows a cancel action). */
  relocatingId: string | null;
  /** Marker whose action popup is open — set only by clicking it. */
  popupId: string | null;
  /** Invisible low-poly sphere used to hide overlays behind the planet. */
  occluderRef: RefObject<Mesh | null>;
  onSelect: (id: string) => void;
  onRelocate: (id: string) => void;
  onRemove: (id: string) => void;
  onCancelRelocate: () => void;
}

// Selection palette: neutral white vs. clearly "active" dark blue.
const COLOR_UNSELECTED = '#ffffff';
const COLOR_SELECTED = '#1a5fd0';

// Freshly placed objects announce themselves: title holds fully
// visible for a moment, then fades, after which the zoom rule applies.
const LABEL_HOLD_S = 1.0;
const LABEL_FADE_S = 0.6;

// Waypoints shrink as the camera descends: near street level a full-size
// marker would dwarf the 2D map the zoom crossfades into (StreetLevel —
// the handover happens around altitude 0.02, globe radius is 1). The
// scale falls off faster than the distance, so a marker's apparent size
// keeps shrinking all the way down instead of holding constant.
const SCALE_ALT_FULL = 0.3; // full size at/above this camera altitude
const SCALE_ALT_MIN = 0.004; // floor reached at/below this altitude
const SCALE_FLOOR = 0.01;

function altitudeSmoothstep(altitude: number): number {
  const t = Math.min(1, Math.max(0, (altitude - SCALE_ALT_MIN) / (SCALE_ALT_FULL - SCALE_ALT_MIN)));
  return t * t * (3 - 2 * t);
}

/** Marker scale for the current camera altitude: 1 in orbit, easing
 *  down to SCALE_FLOOR as the camera closes to street level. */
export function markerScaleForAltitude(altitude: number): number {
  return SCALE_FLOOR + (1 - SCALE_FLOOR) * altitudeSmoothstep(altitude);
}

/** Distinct head geometry per object kind so types are tellable apart
 *  at a glance: sphere = cloud DC, octahedron = AI, box = factory,
 *  flat ring (coin) = crypto farm, pyramid = custom facilities. */
export function MarkerHead({ kind }: { kind: MarkerKind }) {
  switch (kind) {
    case 'ai-data-center':
      return <octahedronGeometry args={[0.026, 0]} />;
    case 'factory':
      return <boxGeometry args={[0.026, 0.026, 0.026]} />;
    case 'crypto-farm':
      return <torusGeometry args={[0.016, 0.007, 8, 20]} />;
    case 'data-center':
      return <sphereGeometry args={[0.018, 16, 16]} />;
    default:
      return <coneGeometry args={[0.018, 0.034, 4]} />;
  }
}

/** Small floating action card anchored just above the marker. */
function MarkerPopup({
  name,
  relocating,
  onRelocate,
  onRemove,
  onCancelRelocate,
}: {
  name: string;
  relocating: boolean;
  onRelocate: () => void;
  onRemove: () => void;
  onCancelRelocate: () => void;
}) {
  return (
    <div className="marker-popup" onPointerDown={(e) => e.stopPropagation()}>
      <span className="marker-popup__name">{name}</span>
      {relocating ? (
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
              onRelocate();
            }}
          >
            ↗ Relocate
          </button>
          <button
            type="button"
            className="marker-popup__action marker-popup__action--remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            − Remove
          </button>
        </>
      )}
    </div>
  );
}

/**
 * One infrastructure marker: a glowing head on a short spike plus a
 * pulsing ring on the surface. The group is oriented so its local +Z
 * axis points away from the globe's center (i.e. "up" at that spot).
 */
function Marker({
  name,
  lat,
  lon,
  kind,
  selected,
  relocating,
  showPopup,
  highlight,
  occluderRef,
  onSelect,
  onRelocate,
  onRemove,
  onCancelRelocate,
}: {
  name: string;
  lat: number;
  lon: number;
  kind: MarkerKind;
  selected: boolean;
  relocating: boolean;
  showPopup: boolean;
  highlight: boolean;
  occluderRef: RefObject<Mesh | null>;
  onSelect: () => void;
  onRelocate: () => void;
  onRemove: () => void;
  onCancelRelocate: () => void;
}) {
  const ringRef = useRef<Mesh<never, MeshBasicMaterial> | null>(null);
  const groupRef = useRef<Group | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);
  // Set on the marker's first rendered frame — used for the intro title.
  const bornAtRef = useRef<number | null>(null);

  const { position, quaternion } = useMemo(() => {
    const pos = latLonToVector3({ lat, lon }, 1.0);
    const q = new Quaternion().setFromUnitVectors(
      new Vector3(0, 0, 1),
      pos.clone().normalize(),
    );
    return { position: pos, quaternion: q };
  }, [lat, lon]);

  useFrame(({ camera, clock }) => {
    if (bornAtRef.current === null) bornAtRef.current = performance.now();

    // Descend-shrink: keep waypoints from dwarfing the street view.
    groupRef.current?.scale.setScalar(
      markerScaleForAltitude(camera.position.length() - 1),
    );

    const ring = ringRef.current;
    if (ring) {
      const speed = highlight ? 2.4 : 1.1;
      const t = clock.elapsedTime * speed;
      ring.scale.setScalar(1 + 0.25 * Math.sin(t));
      ring.material.opacity = 0.55 - 0.35 * Math.abs(Math.sin(t));
    }

    // Title visibility: a 0.4s full-visibility intro right after the
    // object is placed, a fade-out, then the zoom-based rule takes over.
    const label = labelRef.current;
    if (label) {
      const dist = camera.position.distanceTo(position);
      const zoomOpacity = Math.min(1, Math.max(0, (1.35 - dist) / 0.5));

      const age = (performance.now() - bornAtRef.current) / 1000;
      let introOpacity = 0;
      if (age < LABEL_HOLD_S) {
        introOpacity = 1;
      } else if (age < LABEL_HOLD_S + LABEL_FADE_S) {
        introOpacity = 1 - (age - LABEL_HOLD_S) / LABEL_FADE_S;
      }

      // Write the style only when the value actually changes — a DOM
      // style write every frame forces needless recalculation.
      const next = Math.max(introOpacity, zoomOpacity).toFixed(2);
      if (label.style.opacity !== next) label.style.opacity = next;
    }
  });

  const color = selected ? COLOR_SELECTED : COLOR_UNSELECTED;

  return (
    <group ref={groupRef} position={position} quaternion={quaternion}>
      {/* Glowing head just above the surface (generous size = click target).
          Shape depends on the object kind. */}
      <mesh position={[0, 0, 0.05]} onClick={(e) => { e.stopPropagation(); if (cameraTelemetry.streetFade >= STREET_FADE_ACTIVE) return; onSelect(); }}>
        <MarkerHead kind={kind} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Thin spike connecting head to the surface (cylinder is Y-aligned,
          so rotate it to lie along the local +Z axis) */}
      <mesh position={[0, 0, 0.025]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.003, 0.003, 0.05, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Pulsing surface ring */}
      <mesh ref={ringRef} onClick={(e) => { e.stopPropagation(); if (cameraTelemetry.streetFade >= STREET_FADE_ACTIVE) return; onSelect(); }}>
        <ringGeometry args={[0.03, 0.042, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>

      {/* Zoom-in name label: outlined text, faded in by camera distance,
          hidden while the action popup shows the name anyway */}
      {!showPopup && (
        <Html
          position={[0, 0, 0.09]}
          center
          pointerEvents="none"
          zIndexRange={[5, 0]}
          wrapperClass="marker-overlay"
          occlude={[occluderRef] as unknown as [RefObject<Object3D>]}
        >
          <div ref={labelRef} className="marker-label">
            {name}
          </div>
        </Html>
      )}

      {/* Action popup, opened only by a direct click on this marker,
          and hidden while it sits behind the planet. zIndexRange keeps it
          in the app's chrome band: drei's raycast-occlusion mode derives
          the CSS z-index from this range, and the default tops out at
          ~16.7M — floating above the About overlay, header and timeline. */}
      {showPopup && (
        <Html
          position={[0, 0, 0.11]}
          center
          wrapperClass="marker-overlay"
          zIndexRange={[49, 40]}
          occlude={[occluderRef] as unknown as [RefObject<Object3D>]}
        >
          <MarkerPopup
            name={name}
            relocating={relocating}
            onRelocate={onRelocate}
            onRemove={onRemove}
            onCancelRelocate={onCancelRelocate}
          />
        </Html>
      )}
    </group>
  );
}

/** All infrastructure markers currently placed on the globe. */
export default function Markers({
  markers,
  selectedId,
  highlight = false,
  relocatingId,
  popupId,
  occluderRef,
  onSelect,
  onRelocate,
  onRemove,
  onCancelRelocate,
}: MarkersProps) {
  return (
    <group>
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          name={marker.name}
          lat={marker.lat}
          lon={marker.lon}
          kind={marker.kind}
          selected={marker.id === selectedId}
          relocating={marker.id === relocatingId}
          showPopup={marker.id === popupId}
          highlight={highlight}
          occluderRef={occluderRef}
          onSelect={() => onSelect(marker.id)}
          onRelocate={() => onRelocate(marker.id)}
          onRemove={() => onRemove(marker.id)}
          onCancelRelocate={onCancelRelocate}
        />
      ))}
    </group>
  );
}
