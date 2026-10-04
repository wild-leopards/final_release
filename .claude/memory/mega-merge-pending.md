---
name: mega-merge-pending
description: "2026-10-04 evening mega-merge: DONE locally (rebased + all 4 E2E suites green); awaiting PM's word to push"
---

# Mega-merge 2026-10-04 — merged & verified, push pending

**State:** the merge is DONE locally. The 4 WP commits were rebased onto
`origin/main` (13 teammate commits) and verified — `pnpm lint` + `pnpm build`
green, and all three headless-Chrome E2E suites pass (demand-scenarios,
street-interactions incl. popup pointer-events, insecure-origin placement —
26/26 asserts). **Nothing is pushed: the PM's word gates the push.**

Rebased (new hashes):
1. `a56448a` — placement fixes + altitude-honest zoom/rotate + street-view
   interactions + intro fast-hide + map toggle (was `3634e67`)
2. `643f353` — idle-spin restore + cursor-faithful rotation laws + street
   popup pointer-events (was `d42e319`)
3. `6aaba30` — cosφ clamp 0.35 + polar clamp padded 3° (was `207dbfb`)
4. `cd7e6fa` — merge-pending note (superseded by this file)

**Merge resolutions (for future camera/dots work):**
- `WaterStressDots.tsx` / `PopulationDots.tsx` were **deleted** (teammate's
  `DataOverlays.tsx` — real Ember grid-intensity + Aqueduct water-stress
  country gradients, toggled by the LAYERS menu — supersedes the decorative
  dots; my commit's rewrite of them was dropped with the files).
- Camera laws kept INTACT on top: idle-spin gates (hold + 4 s drag/wheel
  cooldown), `rotateSpeedForAltitude` (cap 0.45, cosφ clamp 0.35), polar
  clamp ±0.05 rad, `AltitudeZoom` differential wheel law.
- Teammate features folded in: distance-falloff `autoRotateSpeed` (0.4→0.05
  between distance 3 and 12), `ZOOM_MAX_ALTITUDE` raised 7→11 to match
  their OrbitControls max distance 12 (the falloff normalizes against it),
  `DataOverlays` wiring, their canvas opening distance 1.5 (kept the
  `BULGARIA_VIEW` constant).
- Known open item unchanged (docs/frontend/verification.md): the ~0.1°
  latitude residue between an orbit-placed marker and the camera sub-point
  at street-zoom engagement; street-placed markers stay pixel-exact.

**The E2E harness gotchas earned here** live in
`mac-e2e-headless-chrome.md` (CDP `mouseWheel` produces NO page wheel
events — descend via the city-search fly-to; the intro must be skipped
early or waited out; `.street-popup` unmounts on Remove).

**Next action:** push the 4 commits after the PM approves the merge.
