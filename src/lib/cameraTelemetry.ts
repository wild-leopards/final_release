import { Vector3 } from 'three';

/** Fade fraction at which the street map owns all pointer input (the
 *  invisible-but-raycastable 3D scene yields: clicks hover/placement
 *  switch to the street handlers that project onto the map). */
export const STREET_FADE_ACTIVE = 0.9;

/**
 * Per-frame camera state shared between the R3F scene (writer, inside
 * the Canvas), the DOM-side street map (reader, in its own rAF loop) and
 * the 3D event handlers deciding globe-vs-street input. A module
 * singleton instead of React state: it changes every frame and must
 * never trigger re-renders.
 */
export const cameraTelemetry = {
  position: new Vector3(),
  /** 0 — orbit view … 1 — full street map (kept current by
   *  StreetLevel's sync loop). */
  streetFade: 0,
};
