import type { Provenance } from '../../lib/explain';

const TEXT: Record<Provenance, string> = {
  REAL: 'REAL',
  DERIVED: 'DERIVED',
  SYNTHETIC: 'EST',
};

const TITLE: Record<Provenance, string> = {
  REAL: 'Measured / published dataset',
  DERIVED: 'Formula over real inputs, or interpolated between real data points',
  SYNTHETIC: 'Model assumption (heuristic estimate)',
};

/** Per-value data-provenance badge: REAL / DERIVED / EST, plus a PROJ
 *  marker when the value is carried forward on the timeline. */
export default function ProvenanceBadge({
  kind,
  projected = false,
  source,
}: {
  kind: Provenance;
  projected?: boolean;
  /** Dataset name appended to REAL badges, e.g. "EMBER". */
  source?: string;
}) {
  return (
    <>
      <span className={`trace-badge trace-badge--${kind.toLowerCase()}`} title={TITLE[kind]}>
        {TEXT[kind]}
        {source && kind === 'REAL' ? ` · ${source}` : ''}
      </span>
      {projected && (
        <span className="trace-badge trace-badge--proj" title="Projected along the timeline">
          PROJ
        </span>
      )}
    </>
  );
}
