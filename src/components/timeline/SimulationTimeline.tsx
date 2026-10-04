import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import IconButton from '../ui/IconButton';
import {
  TIMELINE_START_YEAR,
  TIMELINE_END_YEAR,
  TIMELINE_MONTHS,
  formatMonth,
  monthIndexOf,
  timeOfMonthIndex,
} from '../../lib/projection';

interface SimulationTimelineProps {
  /** Timeline time (fractional year, one position per month). */
  year: number;
  /** True while playback advances one year at a time. */
  playing: boolean;
  /** Jump to a year (scrub / step / skip); stops playback. */
  onScrub: (year: number) => void;
  /** Start/pause playback. */
  onTogglePlay: () => void;
}

const LAST = TIMELINE_MONTHS - 1;
const clampIndex = (i: number) => Math.min(LAST, Math.max(0, i));
/** Fractional year of a (clamped) month index. */
const at = (i: number) => timeOfMonthIndex(clampIndex(i));
/** One tick per year (every 5th taller); months stay unticked so the
 *  track doesn't clutter. */
const TICK_YEARS = Array.from(
  { length: TIMELINE_END_YEAR - TIMELINE_START_YEAR + 1 },
  (_, k) => TIMELINE_START_YEAR + k,
);

/** Small inline SVG icons for the transport controls. */

function SkipBackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="19,5 9,12 19,19" />
      <rect x="5" y="5" width="2" height="14" />
    </svg>
  );
}

function StepBackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="16,5 6,12 16,19" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="8,5 19,12 8,19" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="7" y="5" width="3" height="14" />
      <rect x="14" y="5" width="3" height="14" />
    </svg>
  );
}

function StepForwardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="8,5 18,12 8,19" />
    </svg>
  );
}

function SkipForwardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="5,5 15,12 5,19" />
      <rect x="17" y="5" width="2" height="14" />
    </svg>
  );
}

/** Bottom bar: simulation year, playback transport and a scrubbable
 *  timeline track driving the year-by-year projection. */
export default function SimulationTimeline({
  year,
  playing,
  onScrub,
  onTogglePlay,
}: SimulationTimelineProps) {
  // Pointer capture on the track: click or drag anywhere on it to scrub.
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const index = monthIndexOf(year);

  const yearAtPointer = (event: PointerEvent): number => {
    const el = trackRef.current;
    if (!el) return year;
    const rect = el.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return at(Math.round(fraction * LAST));
  };

  // Keyboard stepping: ←/→ one month, Shift+←/→ one year. Ignored while
  // typing in a field so search/inputs keep their arrow keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      const step = (e.shiftKey ? 12 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
      onScrub(at(index + step));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onScrub]);

  const handleTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    onScrub(yearAtPointer(event));
  };

  const handleTrackPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    // Only scrub drags that started on the track: pointer capture routes
    // those here (even outside the element), while a button held down
    // elsewhere (e.g. a text-selection drag crossing the bar) must not
    // yank the timeline year around.
    if (!dragging) return;
    const next = yearAtPointer(event);
    // Only report actual month changes — pointermove fires far more
    // often than the 300 positions change.
    if (monthIndexOf(next) !== index) onScrub(next);
  };

  const stopDragging = () => setDragging(false);

  const progress = (index / LAST) * 100;
  const offsetYears = Math.floor(index / 12);
  const offsetMonths = index % 12;

  const stepButtons: ReactNode = (
    <>
      <IconButton label="Skip to start" onClick={() => onScrub(at(0))}>
        <SkipBackIcon />
      </IconButton>
      <IconButton label="Step back one month (Shift+← one year)" onClick={() => onScrub(at(index - 1))}>
        <StepBackIcon />
      </IconButton>
    </>
  );

  return (
    <footer className="simulation-timeline">
      <span className="timeline-date">{formatMonth(year)}</span>

      <div className="timeline-controls">
        {stepButtons}
        <IconButton label={playing ? 'Pause' : 'Play'} onClick={onTogglePlay}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </IconButton>
        <IconButton label="Step forward one month (Shift+→ one year)" onClick={() => onScrub(at(index + 1))}>
          <StepForwardIcon />
        </IconButton>
        <IconButton label="Skip to end" onClick={() => onScrub(at(LAST))}>
          <SkipForwardIcon />
        </IconButton>
      </div>

      <div className="timeline-divider" />

      {/* Scrubbable track: drag the playhead (or click a year) to project
          the whole dashboard to that point on the timeline. */}
      <div
        ref={trackRef}
        className="timeline-track"
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <div className="timeline-track__fill" style={{ width: `${progress}%` }} />
        <div
          className={`timeline-track__playhead ${dragging ? 'timeline-track__playhead--active' : ''}`}
          style={{ left: `${progress}%` }}
        />
        {TICK_YEARS.map((y) => (
          <span
            key={y}
            className={`timeline-track__tick${(y - TIMELINE_START_YEAR) % 5 === 0 ? ' timeline-track__tick--major' : ''}`}
            style={{ left: `${(((y - TIMELINE_START_YEAR) * 12) / LAST) * 100}%` }}
          />
        ))}
        <span className="timeline-track__start">{TIMELINE_START_YEAR}</span>
        <span className="timeline-track__end">{TIMELINE_END_YEAR}</span>
      </div>

      <span className="timeline-mode">
        {index > 0
          ? `SIM.PROJECT +${offsetYears}Y${offsetMonths ? ` ${offsetMonths}M` : ''}`
          : 'SIM.LIVE'}
      </span>
    </footer>
  );
}
