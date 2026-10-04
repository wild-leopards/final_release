import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import {
  BackSide,
  CanvasTexture,
  DirectionalLight,
  MathUtils,
  Quaternion,
  SRGBColorSpace,
  Spherical,
  Vector3,
} from 'three';
import { latLonToVector3 } from '../../lib/geo3d';
import type { FlyTarget } from '../../lib/geo';
import { cameraTelemetry, STREET_FADE_ACTIVE } from '../../lib/cameraTelemetry';
import type { TraceThreat } from '../../lib/climatetrace/api';
import type { IntroCommand } from '../intro/IntroOverlay';
import Earth from './Earth';
import ThreatDots from './ThreatDots';
import DataCenterDots, { type DataCenterStatus } from './DataCenterDots';
import { GridIntensityOverlay, WaterStressOverlay } from './DataOverlays';
import type { DataCenterPoint } from '../../lib/osm/dataCenters';
import type { GhostMarkerView } from './GhostMarker';
import type { LatLon } from '../../lib/geo';
import type { PlacedMarkerView } from './Markers';

interface GlobeProps {
  markers: PlacedMarkerView[];
  selectedId: string | null;
  placementMode: boolean;
  relocatingId: string | null;
  flyTarget: FlyTarget | null;
  popupId: string | null;
  ghost: GhostMarkerView | null;
  showThreats: boolean;
  /** Threat dot whose card is pinned (mirrored in the inspector). */
  selectedThreat: TraceThreat | null;
  onSelectThreat: (threat: TraceThreat | null) => void;
  showDataCenters: boolean;
  /** Country gradient overlays (real Ember / Aqueduct datasets). */
  showGridOverlay: boolean;
  showWaterOverlay: boolean;
  /** Intro animation command (for the logo and Bulgaria map). */
  introCommand: IntroCommand | null;
  onDataCenterStatus?: (status: DataCenterStatus) => void;
  onDataCenterSelect?: (point: DataCenterPoint) => void;
  onSurfaceClick: (latLon: LatLon) => void;
  onSurfaceHover?: (latLon: LatLon) => void;
  onMarkerSelect: (id: string) => void;
  onMarkerRelocate: (id: string) => void;
  onMarkerRemove: (id: string) => void;
  onCancelRelocate: () => void;
}

/** Key light locked to the camera, so the day side always faces the
 *  user: the whole visible hemisphere stays lit with no terminator
 *  cutting across the view, wherever the globe is rotated. */
function CameraLight() {
  const ref = useRef<DirectionalLight>(null);

  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position);
  });

  return <directionalLight ref={ref} intensity={3.2} />;
}

const FLY_DURATION = 2.6; // seconds
/** Camera distance the fly-to settles at for street-tiled (European)
 *  targets (globe radius is 1): street level, deep inside the map
 *  crossfade band (see StreetLevel.tsx). */
const FLY_DISTANCE = 1.0015;
/** Landing distance for targets without street tiles (outside Europe):
 *  a close orbit — the street map has nothing to show there, so the
 *  camera stays above the crossfade band. */
const FLY_ORBIT_DISTANCE = 2.6;

// Intro constants
const BULGARIA_VIEW = { lat: 42.6, lon: 25.3 };
const HOME_VIEW = new Vector3(0, 0.9, 3.4);
const INTRO_PULL_DURATION = 2.2;
const INTRO_SKIP_DURATION = 0.6;
const INTRO_SPIN_DURATION = 1.6;
const INTRO_SPIN_ANGLE = MathUtils.degToRad(220);
// 'settle': the post-intro spin. Fires when the overlay unmounts — a
// slow, long sweep that reads as the planet turning after "arrival",
// easing out into the idle auto-rotate (home view distance is past the
// idle-spin threshold, so IdleSpin continues the motion from there).
const INTRO_SETTLE_DURATION = 4;
const INTRO_SETTLE_ANGLE = MathUtils.degToRad(140);

interface IntroMove {
  kind: 'move';
  fromDir: Vector3;
  rotation: Quaternion;
  fromDist: number;
  toDist: number;
  elapsed: number;
  duration: number;
}

interface IntroSpin {
  kind: 'spin';
  spherical: Spherical;
  theta0: number;
  angle: number;
  elapsed: number;
  duration: number;
}

type IntroAnim = IntroMove | IntroSpin;

// Intro choreography camera: starts at the Bulgaria close-up (the
// canvas's initial position), pulls back to the home view on
// 'pull-out', does the arrival spin on 'spin', and fast-forwards home
// on 'skip'. Orbit controls are suspended while an anim runs.
function IntroCameraRig({
  command,
  controlsRef,
  onBusyChange,
}: {
  command: IntroCommand | null;
  controlsRef: RefObject<OrbitHandle | null>;
  onBusyChange: (busy: boolean) => void;
}) {
  const camera = useThree((state) => state.camera);
  const anim = useRef<IntroAnim | null>(null);

  useEffect(() => {
    if (!command) return;
    // The intro aims at the globe center — zoom-to-cursor may have
    // drifted the orbit target onto the surface, so center it again.
    controlsRef.current?.target.set(0, 0, 0);
    if (command === 'spin' || command === 'settle') {
      const spherical = new Spherical().setFromVector3(camera.position);
      anim.current = {
        kind: 'spin',
        spherical,
        theta0: spherical.theta,
        angle: command === 'settle' ? INTRO_SETTLE_ANGLE : INTRO_SPIN_ANGLE,
        elapsed: 0,
        duration:
          command === 'settle' ? INTRO_SETTLE_DURATION : INTRO_SPIN_DURATION,
      };
    } else {
      const fromDir = camera.position.clone().normalize();
      anim.current = {
        kind: 'move',
        fromDir,
        rotation: new Quaternion().setFromUnitVectors(fromDir, HOME_VIEW.clone().normalize()),
        fromDist: camera.position.length(),
        toDist: HOME_VIEW.length(),
        elapsed: 0,
        duration:
          command === 'skip' ? INTRO_SKIP_DURATION : INTRO_PULL_DURATION,
      };
    }
    onBusyChange(true);
  }, [command, camera, controlsRef, onBusyChange]);

  useFrame((_, delta) => {
    const state = anim.current;
    if (!state) return;
    state.elapsed = Math.min(state.elapsed + delta, state.duration);
    const t = state.elapsed / state.duration;
    if (state.kind === 'move') {
      const e = easeInOut(t);
      camera.position
        .copy(state.fromDir)
        .applyQuaternion(new Quaternion().slerp(state.rotation, e))
        .multiplyScalar(state.fromDist + (state.toDist - state.fromDist) * e);
    } else {
      state.spherical.theta = state.theta0 + state.angle * (1 - (1 - t) ** 3);
      camera.position.setFromSpherical(state.spherical);
    }
    camera.lookAt(0, 0, 0);
    if (state.elapsed >= state.duration) {
      anim.current = null;
      onBusyChange(false);
    }
  });

  return null;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

// Idle auto-rotation: the planet slowly turns when viewed from orbit
// (the default/zoomed-out view) and holds still as the camera descends,
// so close orbits and the street-level map never drift.
const AUTO_ROTATE_MAX_DISTANCE = 3;
const AUTO_ROTATE_SPEED = 0.3;
/** Idle-spin cooldown after the last pointer/wheel input — and no spin
 *  at all while a selection/placement holds the user's attention. */
const IDLE_RESUME_MS = 4000;
// Scratch: the globe center, for easing the orbit target home.
const ORIGIN = new Vector3();

/** Minimal slice of OrbitControls the camera helpers drive. */
interface OrbitHandle {
  enabled: boolean;
  autoRotate: boolean;
  autoRotateSpeed: number;
  target: Vector3;
  /** Per-frame rotation sensitivity (0–1, 1 = default grab-and-spin). */
  rotateSpeed: number;
}

// ── Altitude-adaptive rotation speed ────────────────────────────────
// Drag-to-rotate must feel like grabbing the planet (a fraction of the
// cursor's speed — the 1.0 default out-spins it) and pan the map 1:1 at
// street level. OrbitControls' rotateSpeed is angle-per-pixel — surface
// distance per pixel scales with altitude, so:

/** tan(45°/2)/π: rotateSpeed that moves the surface point below the
 *  camera by ~one pixel per dragged pixel (exact map-pan law at the
 *  equator; the callers divide by cosφ so horizontal drags stay pixel-
 *  honest at any latitude — azimuthal rotation sweeps the sub-point
 *  along a latitude circle, arc = R·Δθ·cosφ). */
const ROTATE_PAN_K = Math.tan(((45 / 2) * Math.PI) / 180) / Math.PI; // ≈0.132
/** Ceiling for the classic grab-and-spin, reached ≥ one full-climb of
 *  zoom-out (alt = 3 globe radii ≈ the home-ish view). */
const ROTATE_SPIN_MAX = 0.45;
const ROTATE_SPIN_RANGE_ALT = 3;

/** Rotation sensitivity at a camera altitude (globe radius = 1):
 *  monotone down as you descend — orbit spins at a capped fraction of
 *  the cursor, street level pans pixels, not kilometers. */
function rotateSpeedForAltitude(altitude: number): number {
  const pan = ROTATE_PAN_K * altitude;
  const spin = Math.min(1, altitude / ROTATE_SPIN_RANGE_ALT) * ROTATE_SPIN_MAX;
  return Math.max(pan, spin);
}

// ── Altitude-honest wheel zoom ─────────────────────────────────────
// OrbitControls dollies multiplicatively in camera DISTANCE. Near the
// surface (distance ≈ 1) the altitude in that product is a rounding
// error: one standard wheel notch (∼3 % of distance) multiplies the
// ALTITUDE by ∼200×, i.e. the entire street zoom range jumps by ~7
// map-zoom units inside a couple of notches — you coast from orbit view
// into the zoom clamp without ever getting a smooth street zoom, and
// "further zooming in" is impossible. We intercept wheel events one
// capture-phase level up the tree (so OrbitControls never sees them)
// and zoom multiplicatively in ALTITUDE instead: each notch halves/
// doubles… by 2^(-dz) of the altitude, i.e. the map zoom steps a fixed
// MAPLIBRE_Z_PER_NOTCH at EVERY altitude — exactly how MapLibre itself
// zooms, and what keeps the pixel-honest pan law above usable.

/** Map-zoom units a standard mouse notch (deltaY ±120) zooms. */
const MAPLIBRE_Z_PER_NOTCH = 0.4;
/** Altitude bounds (globe radius = 1): deep end ≈ map-zoom ~17 at the
 *  building level (tiles over-zoom past their max fine); shallow end
 *  matches OrbitControls' max distance of 12 (the raised far orbit
 *  view — the idle-spin falloff law normalizes against it). */
const ZOOM_MIN_ALTITUDE = 1.5e-4;
const ZOOM_MAX_ALTITUDE = 11;

function AltitudeZoom({ controlsRef }: { controlsRef: RefObject<OrbitHandle | null> }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const el = gl.domElement;
    // Capture phase one level ABOVE the canvas: our handler runs before
    // OrbitControls' own wheel listener on the element.
    const host = el.parentElement;
    if (!host) return;

    const onWheel = (e: WheelEvent) => {
      const controls = controlsRef.current;
      if (!controls || !controls.enabled) return; // intro/fly-to own the camera
      e.preventDefault();
      e.stopPropagation();
      const dist = camera.position.length();
      const altitude = dist - 1;
      const notch = e.deltaMode === 1 ? (e.deltaY * 18) / 120 : e.deltaY / 120;
      // deltaY < 0 = zoom in; notch magnitude clamped for wild wheels.
      const dz = Math.max(-2.5, Math.min(2.5, -notch)) * MAPLIBRE_Z_PER_NOTCH;
      const newAlt = MathUtils.clamp(altitude * Math.pow(2, -dz), ZOOM_MIN_ALTITUDE, ZOOM_MAX_ALTITUDE);
      // Pan is disabled, so the nadir axis IS the zoom axis (the
      // effective zoom-at-cursor the old zoomToCursor produced anyway —
      // IdleSpin re-centers the orbit target every frame). Keep the
      // nadir direction, set the new altitude.
      camera.position.multiplyScalar((1 + newAlt) / dist);
    };

    host.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => host.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
  }, [gl, camera, controlsRef]);

  return null;
}

/** Per-frame gate for the idle spin: only while the controls are enabled
 *  (the intro and fly-to disable them) and the camera is far out. Also
 *  keeps the drag sensitivity altitude-adaptive (see
 *  rotateSpeedForAltitude) and eases the orbit target back to the globe
 *  center in orbit view — zoom-to-cursor leaves it stranded on the
 *  surface, which would keep the planet off-center and make the idle
 *  spin swing around a surface point instead of the whole globe. */
function IdleSpin({
  controlsRef,
  hold = false,
}: {
  controlsRef: RefObject<OrbitHandle | null>;
  /** While true (a marker selected, popup open, placing/moving) the
   *  idle spin must not resume and drift the working view away. */
  hold?: boolean;
}) {
  const holdRef = useRef(hold);
  useEffect(() => {
    holdRef.current = hold;
  }, [hold]);
  // Last user input (pointer/wheel): the spin resumes only after a
  // cooldown — the camera must never drift under a live interaction.
  const lastInputRef = useRef(0);
  useEffect(() => {
    // Only genuine interaction pauses the spin — a cursor merely
    // hovering/moving across the screen must keep the globe idling.
    let dragging = false;
    const mark = () => {
      lastInputRef.current = performance.now();
    };
    const down = (_e: PointerEvent) => {
      dragging = true;
      mark();
    };
    const move = (e: PointerEvent) => {
      if (dragging || e.buttons) mark(); // a drag is interaction; a hover is not
    };
    const up = () => {
      dragging = false;
      mark();
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('wheel', mark);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('wheel', mark);
    };
  }, []);
  useFrame(({ camera }) => {
    const controls = controlsRef.current;
    if (!controls || !controls.enabled) return;
    const distance = camera.position.length();
    const interactedRecently = performance.now() - lastInputRef.current < IDLE_RESUME_MS;
    controls.autoRotate =
      distance > AUTO_ROTATE_MAX_DISTANCE && !holdRef.current && !interactedRecently;
    // Spin like a hand-turned globe: speed falls off as the camera
    // descends, so close orbits barely drift while the far view turns.
    if (distance > AUTO_ROTATE_MAX_DISTANCE) {
      const normalized =
        (distance - AUTO_ROTATE_MAX_DISTANCE) / (12 - AUTO_ROTATE_MAX_DISTANCE);
      const speed = 0.4 - normalized * 0.35;
      controls.autoRotateSpeed = Math.max(0.05, speed);
    }
    // Altitude-adaptive drag sensitivity: capped grab-and-spin in
    // orbit, 1:1 map pan at street level — latitude-compensated but
    // CLAMPED: azimuthal drags sweep the sub-point along a latitude
    // circle (arc = R·Δθ·cosφ), so dividing by cosφ keeps horizontal
    // pans cursor-honest, yet unclamped compensation flings the planet
    // ("spinning like crazy") as cosφ → 0 near the poles. The divisor
    // caps at 0.35 (everything above ~69.5° latitude drags at the same
    // capped factor); the mercator tiles stop making sense soon after
    // anyway.
    const norm = camera.position.clone().normalize();
    const cosLat = Math.min(1, Math.max(0.35, Math.sqrt(Math.max(0, 1 - norm.y * norm.y))));
    controls.rotateSpeed = rotateSpeedForAltitude(distance - 1) / cosLat;
    // Always keep the earth center in the center, regardless of zoom level
    controls.target.lerp(ORIGIN, 0.06);
  });
  return null;
}

/** Procedural starfield: an inverted sky sphere carrying a canvas
 *  texture of stars. Mesh-based on purpose — GL point sprites proved
 *  unreliable across rasterizers, while a textured sphere renders
 *  identically everywhere. The radius stays inside the camera's far
 *  plane (far = 100, see the Canvas below) and well outside the
 *  camera's max orbit distance (12). */
/** Deterministic per-index hash → [0, 1). Stateless on purpose: pure
 *  texture generation, identical sky on every reload. */
function starRandom(i: number): number {
  let t = (i + 0x9e3779b9) | 0;
  t = Math.imul(t ^ (t >>> 16), 0x45d9f3b);
  t = Math.imul(t ^ (t >>> 16), 0x45d9f3b);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

function Starfield() {
  const texture = useMemo(() => {
    const width = 2048;
    const height = 1024; // equirectangular, matches SphereGeometry UVs
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#02040a'; // deep space, a hair off --bg-main
    ctx.fillRect(0, 0, width, height);
    // ~900 stars: rare bright ones, a middling band, many faint —
    // square-law brightness so the sky reads natural, not uniform.
    for (let i = 0; i < 900; i++) {
      const b = starRandom(i * 3);
      const alpha = 0.2 + 0.8 * b * b;
      const radius = b > 0.93 ? 1.8 : b > 0.7 ? 1.2 : 0.7;
      ctx.fillStyle = `rgba(215, 232, 242, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(
        starRandom(i * 3 + 1) * width,
        starRandom(i * 3 + 2) * height,
        radius,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, []);

  if (!texture) return null;
  return (
    <mesh>
      <sphereGeometry args={[80, 32, 16]} />
      <meshBasicMaterial map={texture} side={BackSide} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

interface Flight {
  fromDir: Vector3;
  rotation: Quaternion;
  fromDist: number;
  toDist: number;
  elapsed: number;
}

/** City-search fly-to: arcs the camera over the globe to the requested
 *  site and settles at a closer distance. Reports flight start/end so the
 *  owner can suspend the orbit controls; OrbitControls re-derives its
 *  orbit from the camera position each frame, so the handoff after
 *  landing is seamless. */
function CameraFlyTo({
  target,
  controlsRef,
  onFlyingChange,
}: {
  target: FlyTarget | null;
  controlsRef: RefObject<OrbitHandle | null>;
  onFlyingChange: (flying: boolean) => void;
}) {
  const camera = useThree((state) => state.camera);
  const flight = useRef<Flight | null>(null);

  useEffect(() => {
    if (!target) return;
    // The flight arcs around the globe center — re-center the orbit
    // target that zoom-to-cursor may have left on the surface.
    controlsRef.current?.target.set(0, 0, 0);
    const fromDir = camera.position.clone().normalize();
    flight.current = {
      fromDir,
      rotation: new Quaternion().setFromUnitVectors(
        fromDir,
        latLonToVector3(target, 1).normalize(),
      ),
      fromDist: camera.position.length(),
      toDist: target.street
        ? Math.min(camera.position.length(), FLY_DISTANCE)
        : FLY_ORBIT_DISTANCE,
      elapsed: 0,
    };
    onFlyingChange(true);
  }, [target, camera, controlsRef, onFlyingChange]);

  useFrame((_, delta) => {
    const state = flight.current;
    if (!state) return;
    state.elapsed = Math.min(state.elapsed + delta, FLY_DURATION);
    const t = easeInOut(state.elapsed / FLY_DURATION);
    camera.position
      .copy(state.fromDir)
      .applyQuaternion(new Quaternion().slerp(state.rotation, t))
      .multiplyScalar(state.fromDist + (state.toDist - state.fromDist) * t);
    // OrbitControls is disabled during the flight, so its per-frame
    // lookAt(target) doesn't run — keep aiming at the globe center
    // ourselves, or the camera slides sideways and the globe drifts
    // out of frame mid-flight.
    camera.lookAt(0, 0, 0);
    if (state.elapsed >= FLY_DURATION) {
      flight.current = null;
      onFlyingChange(false);
    }
  });

  return null;
}

/** Publishes the camera position for the DOM-side street map (see
 *  StreetLevel.tsx) and keeps the projection near-plane just tight
 *  enough for the current altitude — street zoom puts the surface a few
 *  hundred meters from the camera, far below any fixed near plane. */
function CameraTelemetry() {
  useFrame(({ camera }) => {
    cameraTelemetry.position.copy(camera.position);
    const altitude = camera.position.length() - 1; // globe radius is 1
    // Floor 2e-5 keeps the street zoom (down to altitude 1.5e-4 ≈ z17)
    // from clipping the surface: the near plane must stay well under it.
    const wantNear = Math.min(0.5, Math.max(2e-5, altitude * 0.3));
    if (Math.abs(camera.near - wantNear) > wantNear * 0.1) {
      camera.near = wantNear;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

/**
 * Globe owns the 3D scene setup: canvas, camera, lights and controls.
 * The Earth (with its markers) and all interaction live below it.
 */
export default function Globe({
  markers,
  selectedId,
  placementMode,
  relocatingId,
  flyTarget,
  popupId,
  ghost,
  showThreats,
  selectedThreat,
  onSelectThreat,
  showDataCenters,
  showGridOverlay,
  showWaterOverlay,
  onDataCenterStatus,
  onDataCenterSelect,
  onSurfaceClick,
  onSurfaceHover,
  onMarkerSelect,
  onMarkerRelocate,
  onMarkerRemove,
  onCancelRelocate,
  introCommand,
}: GlobeProps) {
  // Orbit controls give way to the camera while the search fly-to runs.
  const [flying, setFlying] = useState(false);
  const handleFlyingChange = useCallback((value: boolean) => setFlying(value), []);
  // OrbitControls instance (narrowed to what the camera helpers need).
  const orbitControlsRef = useRef<OrbitHandle | null>(null);

  return (
    <Canvas
      camera={{
        // Intro opening frame: orbit close-up over Bulgaria; the pull-
        // back takes us to the home view (see IntroCameraRig). The wide
        // near/far band serves the street-level zoom (see CameraTelemetry).
        position: latLonToVector3(BULGARIA_VIEW, 1.5),
        fov: 45,
        near: 0.01,
        far: 100,
      }}
    >
      {/* Base light so nothing is ever fully black */}
      <ambientLight intensity={0.5} />

      {/* Starfield backdrop (mesh-based, see Starfield below) */}
      <Starfield />

      {/* "Sun" — sits exactly behind the user's viewpoint */}
      <CameraLight />

      {/* Opening boot-sequence camera (pull-back + arrival spin) */}
      <IntroCameraRig
        command={introCommand}
        controlsRef={orbitControlsRef}
        onBusyChange={handleFlyingChange}
      />

      <Earth
        markers={markers}
        selectedId={selectedId}
        placementMode={placementMode}
        relocatingId={relocatingId}
        popupId={popupId}
        ghost={ghost}
        onSurfaceClick={onSurfaceClick}
        onSurfaceHover={onSurfaceHover}
        onMarkerSelect={onMarkerSelect}
        onMarkerRelocate={onMarkerRelocate}
        onMarkerRemove={onMarkerRemove}
        onCancelRelocate={onCancelRelocate}
      />

      {/* City search fly-to animation */}
      <CameraFlyTo
        target={flyTarget}
        controlsRef={orbitControlsRef}
        onFlyingChange={handleFlyingChange}
      />

      {/* Camera feed for the street-level map + adaptive near-plane */}
      <CameraTelemetry />

      {/* World's largest real emitters (Climate TRACE) — dot clicks yield
          to the street map at street zoom (the 3D dots stay raycastable
          under the faded scene, but the street facilities layer owns the
          pixels then). */}
      <ThreatDots
        visible={showThreats}
        selected={selectedThreat}
        onSelect={(threat) => {
          if (cameraTelemetry.streetFade < STREET_FADE_ACTIVE) onSelectThreat(threat);
        }}
      />

      {/* Every OSM-tagged data centre on Earth */}
      <DataCenterDots
        visible={showDataCenters}
        onStatus={onDataCenterStatus}
        onSelect={(point) => {
          if (onDataCenterSelect && cameraTelemetry.streetFade < STREET_FADE_ACTIVE) {
            onDataCenterSelect(point);
          }
        }}
      />

      {/* Country gradient overlays — real Ember grid intensity and
          WRI Aqueduct water stress painted across the globe. */}
      <GridIntensityOverlay visible={showGridOverlay} />
      <WaterStressOverlay visible={showWaterOverlay} />

      {/* Mouse orbit + zoom; pan disabled so the globe stays centered.
          makeDefault publishes the controls to useThree() for the fly-to.
          Drag rotation speed and wheel zoom are altitude-honest — see
          IdleSpin (rotateSpeed law) and AltitudeZoom (map-zoom-space
          wheel, intercepted before OrbitControls). minDistance is the
          deep street zoom (≈ map-zoom 17, building level) and the near
          plane adapts below (CameraTelemetry). */}
      <IdleSpin
        controlsRef={orbitControlsRef}
        hold={Boolean(selectedId || popupId || placementMode || relocatingId)}
      />
      <AltitudeZoom controlsRef={orbitControlsRef} />
      <OrbitControls
        ref={(controls) => {
          orbitControlsRef.current = controls;
        }}
        makeDefault
        enabled={!flying}
        enablePan={false}
        enableDamping={false}
        // Pad the polar clamp 3° shy of each pole: at exactly 0/π the
        // azimuthal axis degenerates (a flip over the pole and the view
        // swings wild) and the pole face is never a placement target.
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI - 0.05}
        minDistance={1 + ZOOM_MIN_ALTITUDE}
        maxDistance={1 + ZOOM_MAX_ALTITUDE}
        autoRotateSpeed={AUTO_ROTATE_SPEED}
      />
    </Canvas>
  );
}
