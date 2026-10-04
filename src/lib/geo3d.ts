import { type Ray, Sphere, Vector3 } from 'three';
import type { LatLon } from './geo';

/**
 * Three.js-dependent geo math. Split out of `geo.ts` so entry-chunk code
 * (panels using lat/lon types and formatting) never pulls the whole
 * three library into the first paint bundle — import this only from
 * globe-side code, which lives in the lazy globe chunks anyway.
 */

/**
 * Convert latitude/longitude (degrees) to a position on a sphere of the
 * given radius. This is the standard pairing for an equirectangular Earth
 * texture on a three.js sphere, so markers land on the correct continents.
 */
export function latLonToVector3({ lat, lon }: LatLon, radius = 1): Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

const UNIT_SPHERE = new Sphere(new Vector3(0, 0, 0), 1);
const analyticHitScratch = new Vector3();

/**
 * Analytic ray ∩ unit-sphere hit (world space). Use this instead of the
 * visual Earth mesh's raycast: the 64×64-triangle sphere's chord planes
 * sag up to ~12 km below the true surface, so a mesh hit is off the
 * sub-camera direction by that much — thousands of pixels at street
 * zoom. The returned vector is a shared scratch: copy/consume it before
 * the next call.
 */
export function raySphereHit(ray: Ray): Vector3 | null {
  return ray.intersectSphere(UNIT_SPHERE, analyticHitScratch);
}

/** Inverse of latLonToVector3: a point on the sphere back to lat/lon. */
export function vector3ToLatLon(point: Vector3): LatLon {
  const radius = point.length();
  const lat = 90 - (Math.acos(point.y / radius) * 180) / Math.PI;
  let lon = (Math.atan2(point.z, -point.x) * 180) / Math.PI - 180;
  if (lon < -180) lon += 360;
  if (lon > 180) lon -= 360;
  return { lat, lon };
}
