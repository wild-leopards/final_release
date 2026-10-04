import type { ReactNode } from 'react';

interface ComparisonCardProps {
  /** Provenance badge(s) shown after the label. */
  badge?: ReactNode;
  /** Optional small note line under the row. */
  note?: string;
  /** Uppercase technical label, e.g. "CO₂ EMISSIONS" */
  label: string;
  /** Region value before the infrastructure was placed */
  before: string;
  /** Region value after the infrastructure was placed */
  after: string;
  /** Signed change, e.g. "+146.8" — displayed next to the values */
  delta: string;
  /** Whether the change is an environmental deterioration */
  worse?: boolean;
}

/** BEFORE → AFTER row comparing a regional metric with its delta. */
export default function ComparisonCard({
  label,
  badge,
  before,
  after,
  delta,
  worse = true,
}: ComparisonCardProps) {
  return (
    <div className="comparison-card">
      <span className="comparison-card__label">{label}
        {badge}
      </span>
      <div className="comparison-card__row">
        <span className="comparison-card__before">{before}</span>
        <span className="comparison-card__arrow">→</span>
        <span className="comparison-card__after">{after}</span>
        <span className={`comparison-card__delta${worse ? ' comparison-card__delta--worse' : ' comparison-card__delta--better'}`}>
          {delta}
        </span>
      </div>
    </div>
  );
}
