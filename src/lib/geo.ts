// Three.js-dependent geo math (latLonToVector3, raySphereHit,
// vector3ToLatLon) lives in geo3d.ts — keep this module three-free so
// entry-chunk panels never pull the render library into first paint.

export interface LatLon {
  lat: number; // degrees, -90 (south) .. 90 (north)
  lon: number; // degrees, -180 (west) .. 180 (east)
}

/** Camera fly-to request (city search). The nonce lets repeated picks of
 *  the same site re-trigger the animation. `street` marks targets whose
 *  street-level tiles exist (Europe archive) — only those descend into
 *  the street map; others settle in orbit. */
export interface FlyTarget extends LatLon {
  nonce: number;
  street: boolean;
}

/** "64.1°N · 21.9°W" style label for HUD display. */
export function formatLatLon({ lat, lon }: LatLon): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${ns} · ${Math.abs(lon).toFixed(1)}°${ew}`;
}

/** Great-circle distance between two points, in km. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
