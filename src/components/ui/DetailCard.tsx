interface DetailCardProps {
  /** Uppercase technical label, e.g. "POPULATION" */
  label: string;
  /** Value for the inspected object/region */
  value: string;
  /** Smaller explanatory line below the value */
  note?: string;
}

/** Left-aligned card for one property of the selected globe object. */
export default function DetailCard({ label, value, note }: DetailCardProps) {
  return (
    <div className="detail-card">
      <span className="detail-card__label">{label}</span>
      <div className="detail-card__value">{value}</div>
      {note && <div className="detail-card__note">{note}</div>}
    </div>
  );
}
