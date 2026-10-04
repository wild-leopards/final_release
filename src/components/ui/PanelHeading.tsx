interface PanelHeadingProps {
  title: string;
  subtitle?: string;
}

/** Small technical heading used at the top of side panels. */
export default function PanelHeading({ title, subtitle }: PanelHeadingProps) {
  return (
    <header className="panel-heading">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
}
