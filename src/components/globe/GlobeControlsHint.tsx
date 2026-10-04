import type { ViewportMode } from './GlobeViewport';

interface GlobeControlsHintProps {
  mode?: ViewportMode;
}

/** Thin status/control strip at the bottom of the globe viewport. */
export default function GlobeControlsHint({
  mode = 'idle',
}: GlobeControlsHintProps) {
  return (
    <div
      className={`globe-hint${mode !== 'idle' ? ' globe-hint--placing' : ''}`}
      aria-hidden="true"
    >
      {mode === 'placing'
        ? 'CLICK THE GLOBE TO PLACE · ESC TO CANCEL'
        : mode === 'relocating'
          ? 'CLICK THE GLOBE TO MOVE · ESC TO CANCEL'
          : 'ROTATE · ZOOM · PAN · SELECT'}
    </div>
  );
}
