/**
 * MapLibre 6 loads its web worker from a file next to its own script;
 * a bundler (Vite dev + dep cache) moves the library and the relative
 * worker URL breaks — the map stays blank with "Worker failed to load".
 * Point MapLibre at the worker explicitly via Vite's ?worker&url asset
 * import. Import this module once, before the first map is created.
 */
import { setWorkerUrl } from 'maplibre-gl';
// eslint-disable-next-line import/no-unresolved -- Vite-specific suffix
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);
