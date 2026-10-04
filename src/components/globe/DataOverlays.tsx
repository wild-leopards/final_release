import { useMemo, useState } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { COUNTRY_CENTROIDS } from '../../lib/climatetrace/countryCentroids';
import { emberByIso3, waterStressByIso3 } from '../../lib/data/datasets';

/**
 * Country data overlays: real bundled datasets (Ember grid intensity,
 * WRI Aqueduct water stress) painted as a smooth color gradient shell
 * around the globe. Each country's value is splatted from its centroid
 * across an equirectangular canvas — the nearest-centroid fill turns
 * ~200 point measurements into a continuous "climate map" the user can
 * read at a glance, in the style of temperature anomaly layers.
 */

// Canvas resolution: 4 px per degree for better quality with blur.
const TEX_W = 1440;
const TEX_H = 720;
/** Beyond this angular distance (deg) from any known centroid, stay
 *  transparent (open ocean, Antarctica) so the base map shows through.
 *  10° covers every country interior plus a coastal fringe — a larger
 *  reach paints whole seas and reads as one opaque wash. */
const MAX_REACH_DEG = 10;
/** Blur radius for melting the per-country splats into a smooth
 *  gradient (≈12 px ≈ 3°) — small, so colour doesn't bleed far into
 *  the ocean. */
const BLUR_PX = Math.round(TEX_W * 0.008);

/** Color ramp: green (low) → yellow → orange → red (high). */
function rampColor(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.0, [90, 200, 130]],
    [0.35, [230, 220, 100]],
    [0.65, [240, 160, 70]],
    [1.0, [230, 70, 60]],
  ];
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (clamped <= b) {
      const f = (clamped - a) / (b - a);
      return [
        ca[0] + (cb[0] - ca[0]) * f,
        ca[1] + (cb[1] - ca[1]) * f,
        ca[2] + (cb[2] - ca[2]) * f,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

/** The nearest-centroid field is computed at half resolution (2 px/deg)
 *  and upscaled in the blur pass: the 12 px blur hides the difference,
 *  and it is 4× fewer pixels. Full-res brute force was ~5.6 s of main
 *  thread at boot for both overlays (see docs/frontend/frontend.md). */
const FIELD_W = TEX_W / 2;
const FIELD_H = TEX_H / 2;

/** Paint a nearest-centroid value field into an equirectangular canvas.
 *  Brute force: 259k field pixels × ~200 centroids, squared distances. */
function buildOverlayTexture(
  values: { lat: number; lon: number; t: number }[],
): CanvasTexture | null {
  if (values.length === 0) return null;
  const field = document.createElement('canvas');
  field.width = FIELD_W;
  field.height = FIELD_H;
  const fctx = field.getContext('2d');
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  if (!ctx || !fctx) return null;
  const img = fctx.createImageData(FIELD_W, FIELD_H);
  const cosLat = values.map((v) => Math.cos((v.lat * Math.PI) / 180));
  const reachSq = MAX_REACH_DEG * MAX_REACH_DEG;

  for (let y = 0; y < FIELD_H; y++) {
    const lat = 90 - ((y + 0.5) / FIELD_H) * 180;
    for (let x = 0; x < FIELD_W; x++) {
      const lon = ((x + 0.5) / FIELD_W) * 360 - 180;
      // Nearest centroid (angular distance, coarse: degrees of lat/lon
      // with the longitude delta scaled by the CENTROID's latitude —
      // scaling by the pixel's own cos(lat) collapses the metric toward
      // the poles and painted the entire Arctic band).
      let bestSq = Infinity;
      let bestT = 0;
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        const dLat = lat - v.lat;
        if (dLat * dLat >= bestSq) continue;
        let dLon = lon - v.lon;
        if (dLon > 180) dLon -= 360;
        if (dLon < -180) dLon += 360;
        dLon *= cosLat[i];
        const dSq = dLat * dLat + dLon * dLon;
        if (dSq < bestSq) {
          bestSq = dSq;
          bestT = v.t;
        }
      }
      if (bestSq > reachSq) continue; // transparent: no data here
      const best = Math.sqrt(bestSq);
      const [r, g, b] = rampColor(bestT);
      // Quadratic falloff from the centroid: country interiors carry the
      // full tint, reach edges fade to nothing instead of stopping at a
      // hard disc edge.
      const alpha = 0.5 * ((MAX_REACH_DEG - best) / MAX_REACH_DEG) ** 2;
      const idx = (y * FIELD_W + x) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = Math.round(alpha * 255);
    }
  }
  fctx.putImageData(img, 0, 0);
  ctx.drawImage(field, 0, 0, TEX_W, TEX_H);
  // Blur via an offscreen canvas: drawing the canvas onto itself with a
  // filter composites the blurred copy OVER the original (source-over),
  // nearly doubling every alpha and re-boosting the faded reach edges —
  // the overlay read as an opaque wash because of this.
  if (BLUR_PX > 0) {
    const tmp = document.createElement('canvas');
    tmp.width = TEX_W;
    tmp.height = TEX_H;
    const tctx = tmp.getContext('2d');
    if (tctx) {
      tctx.filter = `blur(${BLUR_PX}px)`;
      tctx.drawImage(canvas, 0, 0);
      ctx.clearRect(0, 0, TEX_W, TEX_H);
      ctx.drawImage(tmp, 0, 0);
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Shared shell: a transparent sphere a hair above the surface carrying
 *  the overlay texture. Hidden layers just fade to zero opacity so the
 *  texture (built once per dataset) is reused on every toggle. */
function OverlayShell({
  texture,
  visible,
  label,
}: {
  texture: CanvasTexture | null;
  visible: boolean;
  label: string;
}) {
  if (!texture) return null;
  return (
    <mesh scale={1.003} renderOrder={1} name={label}>
      <sphereGeometry args={[1, 64, 32]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={visible ? 1 : 0}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/** Latches true the first time `visible` is true: the texture is only
 *  built when the user first toggles the layer on (not at boot), and is
 *  then kept for every later toggle. */
function useShownOnce(visible: boolean): boolean {
  const [shown, setShown] = useState(visible);
  if (visible && !shown) setShown(true);
  return shown || visible;
}

/** GRID INTENSITY layer — Ember 2024 gCO₂e/kWh per country, normalized
 *  against the world range (low-carbon grids ~40, dirtiest ~800+). */
export function GridIntensityOverlay({ visible }: { visible: boolean }) {
  const shown = useShownOnce(visible);
  const texture = useMemo(() => {
    if (!shown) return null;
    const values: { lat: number; lon: number; t: number }[] = [];
    for (const [iso, entry] of emberByIso3) {
      const centroid = COUNTRY_CENTROIDS[iso];
      if (!centroid || iso === 'WRL') continue;
      values.push({
        lat: centroid[0],
        lon: centroid[1],
        t: Math.min(1, entry.latestG / 800),
      });
    }
    return buildOverlayTexture(values);
  }, [shown]);
  return <OverlayShell texture={texture} visible={visible} label="grid-intensity-overlay" />;
}

/** WATER STRESS layer — WRI Aqueduct baseline stress category 0–4. */
export function WaterStressOverlay({ visible }: { visible: boolean }) {
  const shown = useShownOnce(visible);
  const texture = useMemo(() => {
    if (!shown) return null;
    const values: { lat: number; lon: number; t: number }[] = [];
    for (const [iso, entry] of waterStressByIso3) {
      const centroid = COUNTRY_CENTROIDS[iso];
      if (!centroid) continue;
      values.push({ lat: centroid[0], lon: centroid[1], t: entry.cat / 4 });
    }
    return buildOverlayTexture(values);
  }, [shown]);
  return <OverlayShell texture={texture} visible={visible} label="water-stress-overlay" />;
}
