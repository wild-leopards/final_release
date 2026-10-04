import { useEffect, useMemo, useState } from 'react';
import PanelHeading from '../ui/PanelHeading';
import MetricCard from '../ui/MetricCard';
import type { PlacedMarker } from '../../lib/simulation';
import {
  TRACE_DATA_YEAR,
  fetchGlobalTotal,
  formatTonnes,
} from '../../lib/climatetrace/api';
import { TIMELINE_START_YEAR, formatMonth, timelineSummary } from '../../lib/projection';
import ProvenanceBadge from '../ui/ProvenanceBadge';

interface GlobalHudProps {
  markers: PlacedMarker[];
  /** Timeline year the totals are projected to. */
  year: number;
}

/** Left column: totals aggregated from the placed infrastructure as of
 *  the current timeline year, plus the real planet-wide CO₂e total from
 *  Climate TRACE. */
export default function GlobalHud({ markers, year }: GlobalHudProps) {
  const totals = useMemo(() => timelineSummary(markers, year), [markers, year]);
  const projected = year > TIMELINE_START_YEAR;
  const projectionNote = projected ? `Projected to ${formatMonth(year)}` : undefined;

  // Demand scenarios at work: when the fleet's actual IT load exceeds its
  // nameplate the note says by how much (the capacity cap lives in the
  // projection model — see DEMAND_FACTOR_MAX in projection.ts).
  const demandFactor =
    totals.capacityMw > 0 ? totals.itLoadMw / totals.capacityMw : 1;
  const demandNote =
    demandFactor > 1.01
      ? `×${demandFactor.toFixed(1)} nameplate from demand growth`
      : undefined;

  const [globalTonnes, setGlobalTonnes] = useState<number | null>(null);
  const [globalLive, setGlobalLive] = useState(false);
  const [globalFailed, setGlobalFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchGlobalTotal(TRACE_DATA_YEAR)
      .then((v) => {
        if (cancelled) return;
        setGlobalTonnes(v);
        setGlobalLive(true);
      })
      .catch(() => {
        if (!cancelled) {
          setGlobalLive(false);
          setGlobalFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="panel global-hud">
      <PanelHeading
        title="GLOBAL INFRASTRUCTURE HUD"
        subtitle="Planet-wide simulation summary"
      />
      <MetricCard
        label={`Objects ${projected ? `· ${formatMonth(year)}` : ''}`}
        value={String(totals.activeCount)}
        note={
          markers.length === 0
            ? 'None placed yet'
            : totals.activeCount === markers.length
              ? 'Simulated deployments'
              : `${markers.length - totals.activeCount} not built yet`
        }
      />
      <MetricCard
        label="Active IT Load"
        badge={<ProvenanceBadge kind="SYNTHETIC" />}
        value={totals.itLoadMw.toFixed(0)}
        unit="MW"
        note={demandNote ?? projectionNote ?? 'Nameplate of placed facilities'}
      />
      <MetricCard
        label="Est. CO₂"
        badge={<ProvenanceBadge kind="SYNTHETIC" />}
        value={totals.co2KtPerYear.toFixed(1)}
        unit="kt/yr"
        note={projectionNote ?? 'Added annual emissions'}
      />
      <MetricCard
        label={`World CO₂e ${TRACE_DATA_YEAR}`}
        badge={globalLive ? <ProvenanceBadge kind="REAL" source="CLIMATE TRACE" /> : undefined}
        value={globalTonnes !== null ? formatTonnes(globalTonnes) : '—'}
        note={
          globalLive
            ? 'Climate TRACE, satellite-derived'
            : globalFailed
              ? 'Climate TRACE unreachable · heuristic mode'
              : 'Connecting to Climate TRACE…'
        }
      />
    </aside>
  );
}
