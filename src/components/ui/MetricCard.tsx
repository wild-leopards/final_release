import type { ReactNode } from 'react';

interface MetricCardProps {
  /** Provenance badge(s) shown after the label. */
  badge?: ReactNode;
  /** Uppercase technical label, e.g. "ACTIVE NODES" */
  label: string;
  /** Main metric value */
  value: string;
  /** Optional unit rendered next to the value */
  unit?: string;
  /** Smaller explanatory line below the value */
  note?: string;
  /** Highlights the card (e.g. currently selected metric) */
  selected?: boolean;
}

/** Centered HUD-style card for a single global metric. */
export default function MetricCard({
  label,
  badge,
  value,
  unit,
  note,
  selected = false,
}: MetricCardProps) {
  return (
    <div className={`metric-card${selected ? ' metric-card--selected' : ''}`}>
      <span className="metric-card__label">{label}
        {badge}
      </span>
      <span className="metric-card__value">
        {value}
        {unit && <span className="metric-card__unit">{unit}</span>}
      </span>
      {note && <span className="metric-card__note">{note}</span>}
    </div>
  );
}
