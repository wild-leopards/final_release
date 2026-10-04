import PanelHeading from '../ui/PanelHeading';
import ComparisonCard from '../ui/ComparisonCard';
import MetricCard from '../ui/MetricCard';
import type {
  MarkerKind,
  MarkerKindConfig,
  OperationsProfile,
  OperationsScenario,
  PlacedMarker,
} from '../../lib/simulation';
import type { MarkerTraceContext } from '../../lib/simulation';
import { OPERATIONS_SCENARIOS } from '../../lib/simulation';
import { formatTonnes, type TraceThreat } from '../../lib/climatetrace/api';
import { formatLatLon } from '../../lib/geo';
import { estimateFor, type DataCenterPoint } from '../../lib/osm/dataCenters';
import { nearbyDataCenter, COLOCATION_KM } from '../../lib/osm/dataCenters';
import { nearestCountry } from '../../lib/climatetrace/countryCentroids';
import { haversineKm } from '../../lib/geo';
import { emberSlopePctPerYear } from '../../lib/data/datasets';
import {
  TIMELINE_START_YEAR,
  DEMAND_FACTOR_MAX,
  PUE_FLOOR,
  PUE_IMPROVEMENT_PER_YEAR,
  calendarMonth,
  demandFactor,
  formatMonth,
  projectGridIntensity,
  projectImpact,
  rampStatus,
} from '../../lib/projection';
import type { Verdict } from '../../lib/suitability';
import { buildExplainSnapshot, buildMarkerView, type ViewMetric } from '../../lib/explain';
import ProvenanceBadge from '../ui/ProvenanceBadge';
import ExplainPanel from './ExplainPanel';

interface RegionalInspectorProps {
  selected: PlacedMarker | null;
  /** Resolves preset + user-defined custom kinds to their display config. */
  getKindConfig: (kind: MarkerKind) => MarkerKindConfig;
  /** True while a marker is being relocated. */
  relocating: boolean;
  /** Real Climate TRACE context for the selected marker, when loaded. */
  traceContext?: MarkerTraceContext;
  /** Selected "biggest threat" dot — shown instead of the marker panel. */
  threat?: TraceThreat | null;
  /** Timeline time (fractional year, one step per month). */
  year: number;
  /** A real data-center facility clicked on the globe (no marker). */
  selectedDc?: DataCenterPoint | null;
  /** All placements — used for the co-location warning against sibling
   *  facilities. */
  markers: PlacedMarker[];
  /** Inspector scenario dropdown: change a facility's demand profile. */
  onOperationsChange: (id: string, operations: OperationsProfile) => void;
}

/** Profile of a selected Biggest Threats dot: one of the world's largest
 *  individually observed emitters (Climate TRACE). Real data only — no
 *  before/after model applies to facilities we don't operate. */
/** Demo toggle for the placed-facility Climate TRACE card. */
const SHOW_CLIMATE_TRACE_CARD = false;

/** Lets long underscore IDs ("China_OtherBasins_OtherResources") wrap
 *  at the underscores: a zero-width space after each one. */
function breakable(name: string): string {
  return name.replace(/_/g, '_\u200b');
}

function ThreatProfile({ threat }: { threat: TraceThreat }) {
  return (
    <aside className="panel regional-inspector">
      <PanelHeading
        title="REGIONAL DETAILS"
        subtitle="Biggest threat · real observed emissions"
      />
      <div className="detail-card">
        <span className="detail-card__label">
          Facility <span className="trace-badge trace-badge--live">LIVE · CLIMATE TRACE</span>
        </span>
        <div className="detail-card__value">{breakable(threat.name)}</div>
        <div className="detail-card__note">
          {threat.sector ? `${threat.sector.replace(/-/g, ' ')} · ` : ''}
          {threat.country ?? '—'} · {formatLatLon({ lat: threat.lat, lon: threat.lon })}
        </div>
      </div>
      <div className="detail-card trace-card">
        <span className="detail-card__label">
          CLIMATE TRACE · {`annual CO₂e`}
        </span>
        <div className="trace-stats">
          <span className="trace-stat">
            <em>{formatTonnes(threat.emissionsT)}</em> CO₂e/yr
          </span>
        </div>
        <div className="detail-card__note">
          Satellite-derived emissions of this facility — one of the largest
          single sources in the world (top 60)
        </div>
      </div>
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      {/* Simple crosshair marker for the "nothing selected" state */}
      <svg
        className="empty-state__icon"
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="7" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
      <p className="empty-state__message">
        Place a data center and select it on the globe to inspect its
        estimated regional impact.
      </p>
    </div>
  );
}

function ProjectionBadge({ year }: { year: number }) {
  return (
    <span className="trace-badge trace-badge--proj">
      PROJECTED → {formatMonth(year).toUpperCase()}
    </span>
  );
}

/** Badge for one view metric. */
function MetricBadge({ m, projected }: { m: ViewMetric; projected?: boolean }) {
  return (
    <ProvenanceBadge
      kind={m.provenance}
      source={m.source?.toUpperCase()}
      projected={projected && m.provenance !== 'SYNTHETIC'}
    />
  );
}

/** Traffic-light icon per verdict level (checklist layout). */
const VERDICT_ICON: Record<Verdict['level'], string> = {
  good: '✓',
  ok: '⚠',
  bad: '✕',
};

const VERDICT_WORD: Record<Verdict['level'], string> = {
  good: 'GOOD',
  ok: 'FAIR',
  bad: 'POOR',
};

function scoreWord(score: number): string {
  return score >= 70 ? 'GOOD FIT' : score >= 45 ? 'MIXED' : 'POOR FIT';
}

/** SITE ASSESSMENT card: per-kind score plus a traffic-light checklist
 *  of every criterion — icon + plain-language verdict first, the numbers
 *  behind it second, data source badged. */
function SiteAssessmentCard({
  score,
  verdicts,
  year,
}: {
  score: number;
  verdicts: Verdict[];
  year: number;
}) {
  const tone = score >= 70 ? 'good' : score >= 45 ? 'ok' : 'bad';
  return (
    <div className="detail-card assessment-card">
      <span className="detail-card__label">
        SITE ASSESSMENT{' '}
        {year > TIMELINE_START_YEAR && <ProjectionBadge year={year} />}
      </span>
      <div className="assessment-summary">
        <em className={`assessment-summary__score assessment-summary__score--${tone}`}>
          {score}
          <span className="assessment-summary__max"> / 100</span>
        </em>
        <span className="assessment-summary__word">{scoreWord(score)}</span>
      </div>
      <ul className="assessment-checklist">
        {verdicts.map((v) => (
          <li
            key={v.criterion}
            className={`assessment-check assessment-check--${v.level}${
              v.pending ? ' assessment-check--pending' : ''
            }`}
          >
            <span className="assessment-check__icon" aria-hidden="true">
              {v.pending ? '…' : VERDICT_ICON[v.level]}
            </span>
            <div className="assessment-check__body">
              <div className="assessment-check__head">
                <span className="assessment-check__criterion">
                  {v.criterion.toUpperCase()}
                </span>
                {!v.pending && (
                  <span className="assessment-check__level">
                    — {VERDICT_WORD[v.level]}
                  </span>
                )}
              </div>
              <div className="assessment-check__headline">{v.headline}</div>
              <div className="assessment-check__detail">{v.detail}</div>
              <span className="assessment-check__source">{v.source}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Thousands-separated integer formatting for big regional totals. */
const fmtInt = new Intl.NumberFormat('en-US');

/** OPERATIONS card: the facility's demand-growth scenario, editable via
 *  a dropdown (preset rates), with the load multiplier this timeline
 *  year spelled out. */
function OperationsCard({
  operations,
  placedYear,
  year,
  onChange,
}: {
  operations: OperationsProfile;
  placedYear: number;
  year: number;
  onChange: (ops: OperationsProfile) => void;
}) {
  const factor = demandFactor(operations, placedYear, year);
  const pct = operations.annualDemandGrowthPct;
  const capped = factor >= DEMAND_FACTOR_MAX - 1e-9;
  const notBuilt = year < placedYear;
  const note =
    pct === 0
      ? 'Flat demand after the construction ramp'
      : notBuilt
        ? `Scenario: ${pct > 0 ? '+' : ''}${pct}%/yr once operating (not built until ${formatMonth(placedYear)})`
        : `Demand ${pct > 0 ? '+' : ''}${pct}%/yr — ${formatMonth(year)} load ×${
            factor < 1 ? factor.toFixed(2) : factor.toFixed(1)
          } nameplate${capped ? ` (capped at ×${DEMAND_FACTOR_MAX})` : ''}`;
  return (
    <div className="detail-card operations-card">
      <span className="detail-card__label">
        Operations scenario <ProvenanceBadge kind="SYNTHETIC" />
      </span>
      <select
        className="operations-select"
        value={operations.scenario}
        onChange={(e) => {
          const scenario = e.target.value as OperationsScenario;
          onChange({
            scenario,
            annualDemandGrowthPct: OPERATIONS_SCENARIOS[scenario].growthPctPerYear,
          });
        }}
        aria-label="Demand growth scenario"
      >
        {(Object.keys(OPERATIONS_SCENARIOS) as OperationsScenario[]).map((s) => {
          const preset = OPERATIONS_SCENARIOS[s];
          return (
            <option key={s} value={s}>
              {preset.label}
              {preset.growthPctPerYear !== 0
                ? ` · ${preset.growthPctPerYear > 0 ? '+' : ''}${preset.growthPctPerYear}%/yr`
                : ''}
            </option>
          );
        })}
      </select>
      <div className="detail-card__note">{note}</div>
    </div>
  );
}

/** Profile view for a real-world facility clicked on the globe: real
 *  grid intensity and PUE benchmarks, with clearly-labeled estimates
 *  for load, energy and emissions. */
function DataCenterProfile({ dc, year }: { dc: DataCenterPoint; year: number }) {
  const base = estimateFor(dc);
  const projected = year > TIMELINE_START_YEAR;

  // Project the real grid along the country's own Ember history slope
  // (same model as the placed-facility timeline), plus the slow PUE
  // improvement every operating facility gets.
  const { slopePctPerYear } = emberSlopePctPerYear(
    nearestCountry(dc.lat, dc.lon) ?? undefined,
  );
  const gridIntensity = projectGridIntensity(base.gridIntensity, TIMELINE_START_YEAR, slopePctPerYear, year);
  const pue = Math.max(PUE_FLOOR, base.pue - PUE_IMPROVEMENT_PER_YEAR * (year - TIMELINE_START_YEAR));
  const energyGwh = base.capacityMw * pue * 8.76;
  const co2Kt = (energyGwh * 1e6 * gridIntensity) / 1e9;

  return (
    <aside className="panel regional-inspector">
      <PanelHeading
        title="DATA CENTER PROFILE"
        subtitle={projected ? `Real facility · projected to ${formatMonth(year)}` : 'Real facility · click empty globe to deselect'}
      />
      <div className="detail-card">
        <span className="detail-card__label">
          Facility <ProvenanceBadge kind="REAL" source="OSM" />
        </span>
        <div className="detail-card__value">{breakable(dc.name)}</div>
        <div className="detail-card__note">
          {dc.operator ? `${dc.operator} · ` : ''}
          {formatLatLon(dc)}
        </div>
      </div>
      <div className="detail-card trace-card">
        <span className="detail-card__label">
          GRID CARBON INTENSITY · NATIONAL AVG{' '}
          <ProvenanceBadge kind={projected ? 'DERIVED' : 'REAL'} source="EMBER" projected={projected} />
        </span>
        <div className="detail-card__value">
          {gridIntensity.toFixed(0)} <span className="detail-card__kind">gCO₂e/kWh</span>
        </div>
        <div className="detail-card__note">
          {projected
            ? `Published 2024 intensity projected along the country's real Ember trend`
            : 'Ember national grid carbon intensity (nearest country)'}
        </div>
      </div>
      <MetricCard
        label="Benchmark PUE"
        badge={<ProvenanceBadge kind="SYNTHETIC" />}
        value={pue.toFixed(2)}
        note={projected ? 'Improves with the timeline' : 'Industry average for this class'}
      />
      <MetricCard
        label="Est. IT Load"
        badge={<ProvenanceBadge kind="SYNTHETIC" />}
        value={String(base.capacityMw)}
        unit="MW"
        note="Typical for this operator class"
      />
      <MetricCard
        label="Est. Energy"
        badge={<ProvenanceBadge kind="SYNTHETIC" />}
        value={energyGwh.toFixed(0)}
        unit="GWh/yr"
        note="Load × PUE × hours/year"
      />
      <MetricCard
        label="Est. CO₂e"
        badge={<ProvenanceBadge kind="SYNTHETIC" />}
        value={co2Kt.toFixed(0)}
        unit="kt/yr"
        note="Energy × real grid intensity"
      />
    </aside>
  );
}

/** Right column: BEFORE/AFTER environmental profile of the selected
 *  data center, compared against its region's baseline — both projected
 *  to the current timeline year. The baseline CO₂ row starts from real
 *  satellite-derived data when Climate TRACE has the country; the
 *  remaining rows are modelled estimates. */
export default function RegionalInspector({
  selected,
  getKindConfig,
  relocating,
  traceContext,
  threat,
  year,
  selectedDc,
  markers,
  onOperationsChange,
}: RegionalInspectorProps) {
  if (!selected && selectedDc) {
    // DataCenterProfile renders its own .panel.regional-inspector aside —
    // wrapping it again here would double the border/padding and trap
    // its content in a second scroll region.
    return <DataCenterProfile dc={selectedDc} year={year} />;
  }
  if (threat) {
    return <ThreatProfile threat={threat} />;
  }

  if (!selected) {
    return (
      <aside className="panel regional-inspector">
        <PanelHeading
          title="REGIONAL DETAILS"
          subtitle="Updates with the selected globe object"
        />
        <EmptyState />
      </aside>
    );
  }

  const { name, lat, lon, kind } = selected;
  const kindConfig = getKindConfig(kind);
  const projected = year > TIMELINE_START_YEAR;

  // Everything below compares the region WITHOUT the facility against
  // the region WITH it — both carried forward to the timeline month.
  // buildMarkerView is the single source of truth shared with the AI
  // explain snapshot, so the model sees exactly these numbers.
  const view = buildMarkerView(selected, year);
  const { baseline, impact, assessment, footprint } = view;
  const metric = (key: string): ViewMetric => {
    const m = view.metrics.find((x) => x.key === key);
    if (!m) throw new Error(`unknown metric ${key}`);
    return m;
  };
  const snapshot = buildExplainSnapshot(selected, kindConfig, year);
  const lifecycle = rampStatus(selected, year);
  const raw = selected.baseline;
  const monthName = formatMonth(year).split(' ')[0];

  // Co-location: nearest other facility (bundled real data center or one
  // of the user's own placements) within the threshold distance. Hits
  // keep their marker id — auto-generated names can collide (place,
  // remove, place again), so matching by display name could quote the
  // wrong sibling's numbers in the removal estimate below.
  const dcHit = nearbyDataCenter({ lat, lon });
  const markerHit = markers
    .filter((m) => m.id !== selected.id)
    .map((m) => ({
      id: m.id,
      name: m.name,
      distanceKm: haversineKm({ lat, lon }, { lat: m.lat, lon: m.lon }),
    }))
    .filter((m) => m.distanceKm <= COLOCATION_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
  const colocated = (() => {
    if (dcHit && markerHit) return dcHit.distanceKm <= markerHit.distanceKm ? dcHit : markerHit;
    return dcHit ?? markerHit ?? null;
  })();

  // "What if we removed the neighbour?" — the annual energy and emissions
  // the region would shed if the too-close facility disappeared.
  const removalImpact = (() => {
    if (!colocated) return null;
    if (markerHit && colocated === markerHit) {
      const sibling = markers.find((m) => m.id === markerHit.id);
      if (sibling) {
        const imp = projectImpact(sibling, year);
        return { energyGwh: imp.annualEnergyGwh, co2Kt: imp.co2KtPerYear };
      }
      return null;
    }
    if (dcHit && colocated === dcHit) {
      const est = estimateFor(dcHit);
      return { energyGwh: est.energyGwh, co2Kt: est.co2Kt };
    }
    return null;
  })();

  const annualGwh = impact.annualEnergyGwh;
  const temp = metric('siteTempC');
  const share = metric('renewableShare');
  const regionalCo2 = metric('regionalCo2Kt');
  const regionalEnergy = metric('regionalEnergyGwh');

  return (
    <aside className="panel regional-inspector">
      <PanelHeading
        title="REGIONAL DETAILS"
        subtitle={
          relocating
            ? 'Pick a new site on the globe…'
            : `${kindConfig.label} · ${lifecycle.label}`
        }
      />

      <div className="detail-card">
        <span className="detail-card__label">
          Site {projected && <ProjectionBadge year={year} />}
        </span>
        <div className="detail-card__value">
          {formatLatLon({ lat, lon })}{' '}
          <span className="detail-card__kind" style={{ color: kindConfig.accent }}>
            {name}
          </span>
        </div>
        <div className="detail-card__note">
          {baseline.meanTempC.toFixed(1)}°C {raw.climatology ? `${monthName} normal` : 'mean'}{' '}
          <MetricBadge m={temp} projected={projected} />
          {raw.climatology && (
            <> · {raw.climatology.solarKwhM2Day[calendarMonth(year)].toFixed(1)} kWh/m²·d sun</>
          )}
        </div>
        <div className="detail-card__note">
          {baseline.renewableSharePct.toFixed(0)}% renewable grid{' '}
          <MetricBadge m={share} projected={projected} /> · placed {formatMonth(selected.placedYear)}
        </div>
        {colocated && (
          <div className="detail-card__note detail-card__note--warn">
            ⚠ {colocated.distanceKm.toFixed(0)} km from {colocated.name} — co-located
            sites share the grid feed, cooling water and land constraints
            {removalImpact && (
              <>
                <br />
                Removing {colocated.name} would shed ~{removalImpact.energyGwh.toFixed(0)} GWh/yr
                of demand and avoid ~{removalImpact.co2Kt.toFixed(0)} kt CO₂e/yr in this region.
              </>
            )}
          </div>
        )}
      </div>

      <OperationsCard
        operations={selected.operations}
        placedYear={selected.placedYear}
        year={year}
        onChange={(operations) => onOperationsChange(selected.id, operations)}
      />

      <SiteAssessmentCard
        score={assessment.score}
        verdicts={assessment.verdicts}
        year={year}
      />

      <div className="detail-card trace-card">
        <span className="detail-card__label">
          ENERGY FOOTPRINT · WHAT IT TAKES TO POWER IT{' '}
          <ProvenanceBadge kind={footprint.solarReal || footprint.windReal ? 'DERIVED' : 'SYNTHETIC'} />
        </span>
        <div className="trace-stats">
          <span className="trace-stat">
            <em>{annualGwh.toFixed(0)}</em> GWh/yr demand
          </span>
          <span className="trace-stat">
            <em>{footprint.windTurbines}</em> × 5 MW wind turbines at this site
          </span>
          <span className="trace-stat">
            <em>{footprint.solarKm2.toFixed(1)}</em> km² of utility solar here
          </span>
          <span className="trace-stat">
            <em>{footprint.solarDaysPerDay.toFixed(1)}</em> days of 100 MW solar output
            per day of use
          </span>
        </div>
        <div className="detail-card__note">
          Renewables needed to cover one year carbon-free, from this site's{' '}
          {footprint.solarReal ? 'real' : 'assumed'} sun ({footprint.solarKwhM2Day.toFixed(1)}{' '}
          kWh/m²·d) and {footprint.windReal ? 'real' : 'assumed'} wind (turbine capacity factor{' '}
          {(footprint.windCf * 100).toFixed(0)}% at 100 m).
        </div>
      </div>

      {/* Climate TRACE country card hidden for the demo (too dense). The data
          stays in the snapshot, so the AI overview still uses it. */}
      {SHOW_CLIMATE_TRACE_CARD && raw.dataSource === 'climatetrace' && raw.countryName && (
        <div className="detail-card trace-card">
          <span className="detail-card__label">
            CLIMATE TRACE · {raw.dataYear} CO₂e <ProvenanceBadge kind="REAL" />
          </span>
          <div className="detail-card__value">{raw.countryName}</div>
          <div className="trace-stats">
            <span className="trace-stat">
              <em>#{raw.countryRank}</em> global rank
            </span>
            <span className="trace-stat">
              <em>{formatTonnes(raw.regionalCo2KtPerYear * 1e3)}</em> national
            </span>
            <span className="trace-stat">
              <em>{raw.countrySharePct?.toFixed(1)}%</em> of world
            </span>
            <span className="trace-stat">
              <em>{raw.countryPerCapitaT?.toFixed(1)} t</em> per capita
            </span>
            {raw.countryChangePct !== undefined && (
              <span
                className={`trace-stat ${raw.countryChangePct >= 0 ? 'trace-stat--up' : 'trace-stat--down'}`}
              >
                <em>
                  {raw.countryChangePct >= 0 ? '▲' : '▼'}
                  {Math.abs(raw.countryChangePct).toFixed(1)}%
                </em>
                vs prior year
              </span>
            )}
          </div>
        </div>
      )}

      <ComparisonCard
        label="National CO₂e"
        badge={<MetricBadge m={regionalCo2} projected={projected} />}
        before={`${fmtInt.format(Math.round(baseline.regionalCo2KtPerYear))} kt/yr`}
        after={`${fmtInt.format(Math.round(baseline.regionalCo2KtPerYear + impact.co2KtPerYear))} kt/yr`}
        delta={`+${impact.co2KtPerYear.toFixed(1)}`}
        note="Facility added at its estimated load (EST)"
      />
      <ComparisonCard
        label="National Electricity Demand"
        badge={<MetricBadge m={regionalEnergy} projected={projected} />}
        before={`${fmtInt.format(Math.round(baseline.regionalEnergyGwhPerYear))} GWh/yr`}
        after={`${fmtInt.format(Math.round(baseline.regionalEnergyGwhPerYear + annualGwh))} GWh/yr`}
        delta={`+${annualGwh.toFixed(0)}`}
        note="Facility added at its estimated load (EST)"
      />
      <MetricCard
        label="Cooling Water"
        badge={<ProvenanceBadge kind="SYNTHETIC" />}
        value={fmtInt.format(Math.round(impact.waterM3PerDay))}
        unit="m³/day"
        note={
          raw.waterStressLabel
            ? `Region: ${raw.waterStressLabel} water stress (WRI Aqueduct, REAL)`
            : 'No Aqueduct rating for this country'
        }
      />
      <MetricCard
        label="Waste Heat"
        badge={<ProvenanceBadge kind="SYNTHETIC" />}
        value={impact.heatWasteMw.toFixed(1)}
        unit="MW"
        note="IT load × (PUE − 1), rejected to air/water"
      />

      {traceContext?.status === 'ready' && traceContext.topSources.length > 0 && (
        <div className="detail-card trace-card">
          <span className="detail-card__label">
            TOP REAL EMITTERS · {baseline.countryIso3} <ProvenanceBadge kind="REAL" />
          </span>
          <ul className="trace-sources">
            {traceContext.topSources.slice(0, 5).map((src) => (
              <li key={src.id} className="trace-sources__row">
                <span className="trace-sources__name" title={src.name}>
                  {breakable(src.name)}
                </span>
                <span className="trace-sources__val">{formatTonnes(src.emissionsT)}</span>
              </li>
            ))}
          </ul>
          <div className="detail-card__note">
            Satellite-observed facilities in the same country
          </div>
        </div>
      )}

      <ExplainPanel snapshot={snapshot} />
    </aside>
  );
}
