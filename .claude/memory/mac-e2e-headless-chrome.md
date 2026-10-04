---
name: mac-e2e-headless-chrome
description: "How to drive the built frontend headlessly on the team Macs — Chrome + raw CDP, WebGL flags required"
metadata: 
  node_type: memory
  type: project
  originSessionId: e58163bb-2f54-4199-8d3f-013128d66569
  modified: 2026-10-03T12:41:20.670Z
---

On the team Macs there is no playwright/chromium-cli. Visual E2E works with
zero installs: launch installed Google Chrome with
`--headless=new --remote-debugging-port=9333 --use-angle=swiftshader --enable-unsafe-swiftshader`,
then drive it from Node (≥22, built-in `WebSocket`) over raw CDP —
`fetch http://127.0.0.1:9333/json/list` for the page target's
`webSocketDebuggerUrl`, then `Page.navigate` / `Runtime.evaluate` /
`Input.dispatchMouseEvent` (real clicks, needed for the globe canvas and the
timeline scrub) / `Page.captureScreenshot`.

**Why:** without the two swiftshader flags the app crashes at boot — R3F +
MapLibre need WebGL2 and there is no error boundary, so `#root` renders
empty; the tell is a `GPUInitializationError` console exception.

**How to apply:** serve with `pnpm preview --port 4173`, click once anywhere
to skip the intro, drive `.globe-action-button` → `.object-menu__option` to
place a marker, scrub `.timeline-track`. A working driver script pattern was
used 2026-10-03 (kept in /tmp — ephemeral, recreate from this note).

**Two session-tested gotchas (2026-10-03, demand-scenario E2E):**

- **Launch with an isolated `--user-data-dir`** (temp folder): a headless
  instance sharing the running desktop Chrome's profile flakes out
  (page targets recycle mid-run, `querySelector` returns null on a
  half-mounted document, CDP input dies). Park the page on
  `about:blank` when a suite ends — left-open pages keep the E2E app
  rendering and the swiftshader GPU helper process burns several CPU
  cores doing it.
- Vite preview binds **IPv6 only** (`[::1]:4173` on the Macs) — navigate
  CDP to `http://localhost:4173/`, NOT `http://127.0.0.1/…`
  (`net::ERR_CONNECTION_REFUSED`, then `#root` empty
  for the most confusing reason).
- The real-input flow means every UI action is plain CDP: real mousedown/
  up for clicks (globe, buttons, timeline track), and for React-driven
  `<select>` (e.g. the inspector OPERATIONS scenario dropdown) set the
  value via the `HTMLSelectElement.prototype.value` native setter then
  `dispatchEvent(new Event('change', {bubbles: true}))` — React state
  follows.
- **CDP `Input.dispatchMouseEvent` type `mouseWheel` produces NO page
  wheel events in this headless Chrome** (verified 2026-10-04: a capture
  listener on `.globe-canvas__scene` stays empty — the 3D zoom/wheel laws
  are NOT drivable this way). To reach street zoom in E2E, fly instead:
  click `.city-search__input`, `Input.insertText` a city name, click the
  first `.city-search__option` — the fly-to lands European targets at
  street distance and the street map owns the view (`.globe-canvas__scene`
  inline opacity → 0).
- **Skip the intro EARLY** (within ~1 s of the dashboard mounting, before
  the choreography's fade-out phase gives `.intro-overlay` `pointer-events:
  none` — clicks then fall through to the canvas and the intro keeps
  running ~7.7 s). Gating that always works: wait until
  `getComputedStyle(.global-hud).opacity >= 0.9` before interacting —
  both the skip path and the natural outro end with the HUD revealed.
- `.street-popup` is conditionally rendered (`popupMarker && <div>`) —
  after the popup's Remove it UNMOUNTS entirely (assert element absence,
  not computed visibility).
- Re-run the walkthrough after any projection change; it should place an
  AI Data Center, flip its scenario and scrub to 2050 — expected state is
  written in docs/frontend/verification.md.
Related: [[win-machine-no-git]].
