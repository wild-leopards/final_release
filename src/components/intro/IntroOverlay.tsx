import { useEffect, useRef } from 'react';
import { Map as MaplibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import gsap from 'gsap';
import { basemapStyle, resolveTilesUrl } from '../../lib/basemap';
// This chunk creates the first map of the boot sequence and loads
// independently of StreetLevel (which also fixes the worker URL) —
// the fix must have run before that first baseline map is built.
import '../../lib/maplibreWorker';
import logoUrl from '../../../logo.svg';

/** Camera commands the intro choreography sends to the globe. */
export type IntroCommand = 'pull-out' | 'spin' | 'settle' | 'skip';

/** Merge toggle: does the intro open on the fullscreen OSM street map
 *  of Bulgaria (current design) or not? Flip to false to run the same
 *  choreography on the plain dark background — the flag exists so a
 *  teammate removing the Bulgaria intro doesn't fork the code; the rest
 *  of the sequence (pull-back, arrival spin, dashboard reveal) is
 *  identical either way. */
const INTRO_STREET_MAP = true;

// The whole choreography, in one place (ms from mount):
//   0         fullscreen Bulgaria map, slow push-in
//   2400      "drone" pull-back: map zooms out + fades, globe camera
//             dollies back from the Bulgaria close-up (pull-out)
//   4600      map gone; globe does its arrival spin
//   5400      dashboard elements rise in (GSAP stagger)
//   6700      overlay unmounts; the globe gets a 'settle' spin that
//             eases out into the idle rotation as the app goes live
const MAP_HOLD = 2_400;
const PULL_DURATION = 2_200;
const FADE_INTO_PULL = 1_200;
const UI_INTO_SPIN = 800;
const END_AFTER_SPIN = 2_100;

/** Camera positions for the intro choreography */
const BG_CENTER: [number, number] = [25.3, 42.6];
const PULL_CENTER: [number, number] = [25.2, 34];

/** Dashboard chrome that hides during the intro and rises in at the end.
 *  The globe canvas itself stays visible so the arrival spin is seen. */
const UI_TARGETS = [
  '.app-header',
  '.global-hud',
  '.viewport-title',
  '.viewport-actions',
  '.globe-hint',
  '.regional-inspector',
  '.simulation-timeline',
];

interface IntroOverlayProps {
  /** Forward choreography beats to the globe camera. */
  onGlobeCommand: (command: IntroCommand) => void;
  /** Called when the overlay can unmount (sequence finished or skipped). */
  onDone: () => void;
}

/**
 * Boot-sequence overlay: opens on a dark map of Bulgaria, pulls back
 * "to orbit" while the 3D globe takes over, spins the globe, then
 * reveals the dashboard with a GSAP stagger. Any click skips straight
 * to the finished state.
 */
export default function IntroOverlay({
  onGlobeCommand,
  onDone,
}: IntroOverlayProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const captionRef = useRef<HTMLSpanElement | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    // The pre-JS boot shell painted in index.html is superseded by this
    // live overlay (same look, higher z-index) — remove it so it cannot
    // resurface under the dashboard after the intro unmounts.
    document.getElementById('intro-shell')?.remove();

    // The dashboard waits below its reveal until the sequence ends.
    gsap.set(UI_TARGETS, { autoAlpha: 0, y: 18 });

    // The choreography is driven entirely by these timers and must
    // complete even if the 2D map can't start (tile server down,
    // WebGL trouble) — so every timer is scheduled before the map is
    // created and every map call is fail-safe.
    let map: MaplibreMap | null = null;
    const timers: number[] = [];
    const at = (delay: number, fn: () => void) =>
      timers.push(window.setTimeout(fn, delay));

    at(MAP_HOLD, () => {
      // Drone pull-back: map zooms out to the whole region while the
      // globe camera (commanded separately) rises from its close-up.
      if (captionRef.current) {
        captionRef.current.textContent = 'ASCENDING TO ORBIT…';
      }
      // Loading is done — the splash logo yields to the pull-back.
      gsap.to(logoRef.current, { autoAlpha: 0, duration: 0.8 });
      // Hide the 2D map fast: the OSM map must not linger as a "strange
      // background" under the dashboard chrome that fades in over it —
      // the globe scene takes over now and the map comes back after.
      // (No map exists when INTRO_STREET_MAP is off — the flag simply
      // decides whether a street map shows on start.)
      mapContainerRef.current?.classList.add('intro-overlay__map--hidden');
      onGlobeCommand('pull-out');
      try {
        map?.flyTo({
          center: PULL_CENTER,
          zoom: 1.9,
          duration: PULL_DURATION,
          curve: 1.4,
          essential: true,
        });
      } catch {
        // Map trouble must never stall the sequence.
      }
    });
    at(MAP_HOLD + FADE_INTO_PULL, () =>
      rootRef.current?.classList.add('intro-overlay--fade'),
    );
    at(MAP_HOLD + PULL_DURATION, () => {
      if (captionRef.current) {
        captionRef.current.textContent = 'ORBITAL INSERTION COMPLETE';
      }
      onGlobeCommand('spin');
    });
    at(MAP_HOLD + PULL_DURATION + UI_INTO_SPIN, () => {
      // Panels rise in while the tail of the spin settles.
      // Deliberately NOT killed in the cleanup: this tween animates the
      // dashboard chrome, which is live DOM that outlives the overlay —
      // killing it mid-flight on unmount would freeze the panels at
      // partial opacity (seen as a half-faded dashboard in dev/StrictMode,
      // where the unmount lands inside the stagger window).
      gsap
        .timeline()
        .to(UI_TARGETS, {
          autoAlpha: 1,
          y: 0,
          duration: 0.7,
          ease: 'power3.out',
          stagger: 0.12,
        });
    });
    at(MAP_HOLD + PULL_DURATION + END_AFTER_SPIN, () => {
      // End of the movie: the globe takes over with a smooth settle
      // spin (commanded before unmount — the command outlives the
      // overlay in App state). Skipping lands directly in the finished
      // state instead, with no extra camera work.
      onGlobeCommand('settle');
      onDone();
    });

    // The map is the weakest link — create it last so nothing above
    // can be blocked by it. If it can't start, the intro plays out on
    // the plain dark background instead. Tile URL is resolved first
    // (own archive, public fallback) so a dead source never stalls the
    // initial style. Skipped entirely when INTRO_STREET_MAP is off —
    // then the whole intro runs as camera work over the dark backdrop.
    if (!INTRO_STREET_MAP) return;
    let disposed = false;
    resolveTilesUrl()
      .then((tilesUrl) => {
        // A slow probe can resolve after unmount — don't leak a map.
        if (disposed || !mapContainerRef.current) return;
        try {
          map = new MaplibreMap({
            container: mapContainerRef.current!,
            style: basemapStyle(tilesUrl),
            center: BG_CENTER,
            zoom: 6.4,
            attributionControl: false,
            interactive: false, // the intro is a movie, not a map session
          });
          // Slow aerial push-in once the style is ready to animate.
          map.on('load', () => {
            try {
              map?.flyTo({
                center: BG_CENTER,
                zoom: 6.7,
                duration: MAP_HOLD + 200,
                essential: true,
              });
            } catch {
              // non-fatal
            }
          });
        } catch {
          // Map trouble must never stall the sequence.
        }
      })
      .catch(() => {
        // No tiles at all — the intro still plays on the dark background.
      });

    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      map?.remove();
    };
  }, [onGlobeCommand, onDone]);

  const skip = () => {
    // Jump straight to the finished state: UI visible, camera home.
    gsap.set(UI_TARGETS, { autoAlpha: 1, y: 0 });
    onGlobeCommand('skip');
    onDone();
  };

  return (
    <div
      className="intro-overlay"
      ref={rootRef}
      onClick={skip}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        textAlign: 'center',
        width: '100%',
      }}
    >
      <div className="intro-overlay__map" ref={mapContainerRef} />
      <img
        ref={logoRef}
        className="intro-overlay__logo"
        src={logoUrl}
        alt="Energy Around Us"
      />
      <span className="intro-overlay__title">EARTH ENERGY MONITOR</span>
      <span
        className="intro-overlay__caption"
        ref={captionRef}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'center',
        }}
      >
        SURVEYING BULGARIA // TERRAIN SCAN
      </span>
    </div>
  );
}