import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  type MarkerKind,
  type MarkerKindConfig,
  type PresetMarkerKind,
} from '../../lib/simulation';
import type { ViewportMode } from './GlobeViewport';
import { randomId } from '../../lib/id';

/** Tiny inline glyphs so each option reads instantly. */
const KIND_ICONS: Record<PresetMarkerKind, ReactNode> = {
  // Server racks
  'data-center': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="18" height="6" rx="1" />
      <rect x="3" y="14" width="18" height="6" rx="1" />
      <circle cx="7" cy="7" r="0.6" fill="currentColor" />
      <circle cx="7" cy="17" r="0.6" fill="currentColor" />
    </svg>
  ),
  // AI chip
  'ai-data-center': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <rect x="10" y="10" width="4" height="4" />
      <line x1="9" y1="2" x2="9" y2="6" />
      <line x1="15" y1="2" x2="15" y2="6" />
      <line x1="9" y1="18" x2="9" y2="22" />
      <line x1="15" y1="18" x2="15" y2="22" />
      <line x1="2" y1="9" x2="6" y2="9" />
      <line x1="2" y1="15" x2="6" y2="15" />
      <line x1="18" y1="9" x2="22" y2="9" />
      <line x1="18" y1="15" x2="22" y2="15" />
    </svg>
  ),
  // Factory skyline
  factory: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 20h20" />
      <path d="M4 20v-8l5 3v-3l5 3v-3l6 3v5" />
      <rect x="17" y="3" width="3" height="5" />
    </svg>
  ),
  // Coin
  'crypto-farm': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M10 8h3.5a2 2 0 0 1 0 4H10zm0 4h4a2 2 0 0 1 0 4h-4zm1.5-6.5v2m3-2v2m-3 9v2m3-2v2" />
    </svg>
  ),
};

// Sparkle — anything the user defines themselves
const CUSTOM_ICON: ReactNode = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />
  </svg>
);

function getKindIcon(kind: MarkerKind): ReactNode {
  return KIND_ICONS[kind as PresetMarkerKind] ?? CUSTOM_ICON;
}

/** Accent swatches offered for custom facilities. */
const CUSTOM_ACCENTS = ['#ff6b6b', '#ffd166', '#f26bd8', '#6bd9ff'];

interface AddObjectControlProps {
  kinds: readonly MarkerKindConfig[];
  mode: ViewportMode;
  pendingLabel: string;
  /** Live site outlook under the placement label (cursor country data
   *  — real Ember grid + Aqueduct water, latitude-band cooling est.). */
  outlook?: string | null;
  onEnterPlacement: (kind: MarkerKind) => void;
  onCancelMode: () => void;
  /** Registers a freshly defined custom facility kind. */
  onCreateKind: (config: MarkerKindConfig) => void;
}

/** Bottom-center control: opens the facility-type picker, then drives
 *  placement mode. Dropdown closes on pick, outside click or ESC. */
export default function AddObjectControl({
  kinds,
  mode,
  pendingLabel,
  outlook,
  onEnterPlacement,
  onCancelMode,
  onCreateKind,
}: AddObjectControlProps) {
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('30');
  const [accent, setAccent] = useState(CUSTOM_ACCENTS[0]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const active = open || mode !== 'idle';
  const menuVisible = open && mode === 'idle';

  const buttonLabel =
    mode === 'placing'
      ? '− Cancel Placement'
      : mode === 'relocating'
        ? '− Cancel Move'
        : '+ Add Object';

  const helper =
    mode === 'placing'
      ? `Placing ${pendingLabel} · click the globe or ESC to cancel`
      : mode === 'relocating'
        ? `Moving ${pendingLabel} · click the globe or ESC to cancel`
        : open
          ? 'Pick a facility type below'
          : 'Choose facility type, then place it on the globe';

  const submitCustom = () => {
    const label = name.trim() || 'Custom Facility';
    const parsed = Number(capacity);
    const capacityMw = Math.min(999, Math.max(1, Number.isFinite(parsed) ? parsed : 30));
    const config: MarkerKindConfig = {
      kind: `custom-${randomId()}`,
      label,
      spec: `~${capacityMw} MW · custom facility`,
      accent,
      capacityMw,
      pueBias: 0,
    };
    onCreateKind(config);
    setFormOpen(false);
    setName('');
    setCapacity('30');
    setAccent(CUSTOM_ACCENTS[0]);
    onEnterPlacement(config.kind);
    setOpen(false);
  };

  return (
    <div className="viewport-actions">
      <div className="add-object" ref={rootRef}>
        {menuVisible && (
          <div className="object-menu" role="menu" aria-label="Facility type">
            {formOpen ? (
              <form
                className="object-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitCustom();
                }}
              >
                <span className="object-menu__heading">
                  <button
                    type="button"
                    className="object-form__back"
                    onClick={() => setFormOpen(false)}
                    aria-label="Back to type list"
                  >
                    ←
                  </button>
                  CUSTOM FACILITY
                </span>

                <label className="object-form__field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={name}
                    placeholder="e.g. Fusion Plant"
                    maxLength={28}
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                  />
                </label>

                <label className="object-form__field">
                  <span>Capacity (MW)</span>
                  <input
                    type="number"
                    value={capacity}
                    min={1}
                    max={999}
                    onChange={(event) => setCapacity(event.target.value)}
                  />
                </label>

                <div className="object-form__field">
                  <span>Accent</span>
                  <div className="object-form__swatches">
                    {CUSTOM_ACCENTS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`object-form__swatch${accent === color ? ' object-form__swatch--picked' : ''}`}
                        style={{ background: color }}
                        onClick={() => setAccent(color)}
                        aria-label={`Accent ${color}`}
                      />
                    ))}
                  </div>
                </div>

                <button type="submit" className="object-form__submit">
                  CREATE &amp; PLACE →
                </button>
              </form>
            ) : (
              <>
                <span className="object-menu__heading">SELECT FACILITY TYPE</span>
                {kinds.map((cfg, index) => (
                  <button
                    key={cfg.kind}
                    type="button"
                    role="menuitem"
                    className="object-menu__option"
                    style={{ animationDelay: `${index * 45}ms` }}
                    onClick={() => {
                      onEnterPlacement(cfg.kind);
                      setOpen(false);
                    }}
                  >
                    <span
                      className="object-menu__icon"
                      style={{ color: cfg.accent, borderColor: cfg.accent }}
                    >
                      {getKindIcon(cfg.kind)}
                    </span>
                    <span className="object-menu__text">
                      <span className="object-menu__name">{cfg.label}</span>
                      <span className="object-menu__spec">{cfg.spec}</span>
                    </span>
                    <span className="object-menu__arrow">→</span>
                  </button>
                ))}
                <div className="object-menu__divider" />
                <button
                  type="button"
                  role="menuitem"
                  className="object-menu__option"
                  style={{ animationDelay: `${kinds.length * 45}ms` }}
                  onClick={() => setFormOpen(true)}
                >
                  <span className="object-menu__icon object-menu__icon--custom">
                    {CUSTOM_ICON}
                  </span>
                  <span className="object-menu__text">
                    <span className="object-menu__name">Custom Facility…</span>
                    <span className="object-menu__spec">Define your own load</span>
                  </span>
                  <span className="object-menu__arrow">+</span>
                </button>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          className={`globe-action-button${active ? ' globe-action-button--active' : ''}`}
          onClick={() => (mode !== 'idle' ? onCancelMode() : setOpen((o) => !o))}
        >
          <span className="globe-action-button__label">
            {buttonLabel}
            {mode === 'idle' && (
              <span className={`globe-action-button__caret${open ? ' globe-action-button__caret--open' : ''}`}>
                ▾
              </span>
            )}
          </span>
          <span className="globe-action-button__helper">{helper}</span>
        </button>

        {mode !== 'idle' && outlook && (
          <div className="object-outlook">{outlook}</div>
        )}
      </div>
    </div>
  );
}
