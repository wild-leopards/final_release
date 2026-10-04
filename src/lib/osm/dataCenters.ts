/**
 * Data-center layer source.
 *
 * Ships a bundled dataset of major facilities (see dataCentersBundled.ts)
 * instead of querying a live API: Overpass and Wikidata both proved
 * unreliable for this category, and an offline layer can never fail in
 * the demo. The async shape is kept so the component is swap-ready if a
 * good live source appears.
 *
 * REAL vs. ESTIMATED per facility (shown in the tooltip):
 * - Grid carbon intensity: REAL — published national figures
 *   (Ember/IRENA-style yearbook values, gCO₂e/kWh, ~2024).
 * - PUE: REAL benchmark — Uptime Institute industry averages
 *   (hyperscale ≈1.15, colo ≈1.55).
 * - Capacity / energy / CO₂: ESTIMATE from the typical scale of that
 *   operator class × real grid intensity.
 */

import { BUNDLED_DATA_CENTERS, type BundledDataCenter } from './dataCentersBundled';
import { haversineKm } from '../geo';
import { emberByIso3 } from '../data/datasets';
import { nearestCountry } from '../climatetrace/countryCentroids';

export interface DataCenterPoint {
  id: string;
  name: string;
  operator?: string;
  lat: number;
  lon: number;
}

let cache: Promise<DataCenterPoint[]> | null = null;

/** All bundled data centers, mapped to the layer's point shape. */
export function fetchOsmDataCenters(): Promise<DataCenterPoint[]> {
  if (cache) return cache;
  cache = Promise.resolve(
    BUNDLED_DATA_CENTERS.map((d: BundledDataCenter, i: number) => ({
      id: `dc-${i}`,
      name: d.name,
      operator: d.operator,
      lat: d.lat,
      lon: d.lon,
    })),
  );
  return cache;
}

// ── Real grid intensity by location hint ───────────────────────────

/** [substring of facility name/operator, national gCO₂e/kWh]. First
 *  match wins; ordering puts specific cities before shared words. */
const GRID_HINTS: [string, number][] = [
  // Bulgaria
  ['Sofia', 450], ['Interop Sofia', 450],
  // UK / Ireland
  ['London', 230], ['Slough', 230], ['Woking', 230], ['Dublin', 300],
  // BeNeLux
  ['Amsterdam', 290], ['Eemshaven', 290], ['Saint-Ghislain', 160],
  // DACH
  ['Frankfurt', 350], ['Nuremberg', 350], ['Falkenstein', 350],
  ['Magdeburg', 350], ['Berlin', 350], ['Zurich', 60], ['Vienna', 130],
  // Nordics
  ['Copenhagen', 150], ['Stockholm', 45], ['Gävle', 45], ['Hamina', 80],
  ['Luleå', 30],
  // Rest of Europe
  ['Warsaw', 660], ['Milan', 330], ['Madrid', 150], ['Lisbon', 170],
  ['Athens', 350], ['Bucharest', 260], ['Budapest', 220], ['Istanbul', 440],
  ['Gravelines', 55], ['Paris', 55],
  // Americas
  ['São Paulo', 100], ['Hortolândia', 100], ['Santiago', 350], ['Bogotá', 230],
  ['Montreal', 130], ['Calgary', 130], ['Toronto', 130], ['Mexico City', 430],
  ['Ashburn', 370], ['Reston', 370], ['New Albany', 370], ['Quincy', 370],
  ['Boardman', 370], ['The Dalles', 370], ['Prineville', 370],
  ['San Antonio', 370], ['Garland', 370], ['Chicago', 370], ['Secaucus', 370],
  ['8th Ave', 370], ['New York', 370], ['Boydton', 370], ['Lenoir', 370],
  ['Forest City', 370], ['Atlanta', 370], ['Des Moines', 370],
  ['Sioux Falls', 370], ['Phoenix', 370], ['Las Vegas', 370],
  ['San Jose', 370], ['Santa Clara', 370], ['El Segundo', 370],
  ['Los Angeles', 370], ['Cheyenne', 370],
  // APAC
  ['Tokyo', 460], ['Osaka', 460], ['Singapore', 400], ['Jurong', 400],
  ['Hong Kong', 600], ['Sydney', 500], ['Melbourne', 500], ['Perth', 500],
  ['Auckland', 120], ['Seoul', 440], ['Gasan', 440], ['Mumbai', 700],
  ['Pune', 700], ['Hyderabad', 700], ['Chennai', 700], ['Noida', 700],
  ['Jakarta', 700], ['Bangkok', 500], ['Kuala Lumpur', 550],
  // MEA
  ['Dubai', 400], ['Abu Dhabi', 400], ['Bahrain', 500], ['Doha', 490],
  ['Riyadh', 450], ['Tel Aviv', 530], ['Cairo', 460], ['Johannesburg', 900],
  ['Cape Town', 550], ['Kampala', 60], ['Lagos', 400], ['Nairobi', 100],
  ['Accra', 350],
];

/** Real grid intensity (gCO₂e/kWh) for a facility: the bundled Ember
 *  national value of the nearest country; the city hint table and the
 *  world average are fallbacks only. */
export function gridIntensityFor(dc: DataCenterPoint): number {
  const iso = nearestCountry(dc.lat, dc.lon);
  const ember = iso ? emberByIso3.get(iso) : undefined;
  if (ember) return ember.latestG;
  const hay = `${dc.name} ${dc.operator ?? ''}`;
  for (const [hint, intensity] of GRID_HINTS) {
    if (hay.includes(hint)) return intensity;
  }
  return 400; // world average fallback
}

// ── Operator-class sizing (real industry benchmarks) ───────────────

const HYPERSCALERS = ['Amazon', 'Microsoft', 'Google', 'Meta'];

/** Typical IT load + PUE for this operator class (Uptime Institute). */
export function sizingFor(dc: DataCenterPoint): { capacityMw: number; pue: number } {
  const op = dc.operator ?? '';
  if (HYPERSCALERS.some((h) => op.includes(h))) return { capacityMw: 80, pue: 1.15 };
  if (op.includes('OVH') || op.includes('Hetzner')) return { capacityMw: 40, pue: 1.3 };
  return { capacityMw: 25, pue: 1.55 };
}

export interface DcEstimate {
  /** REAL grid intensity, gCO₂e/kWh. */
  gridIntensity: number;
  /** REAL benchmark PUE. */
  pue: number;
  /** ESTIMATED IT load, MW. */
  capacityMw: number;
  /** ESTIMATED annual energy, GWh (capacity × PUE × 8.76). */
  energyGwh: number;
  /** ESTIMATED annual emissions, kt CO₂e (energy × real grid). */
  co2Kt: number;
}

/** Full real+estimated profile for a facility. */
export function estimateFor(dc: DataCenterPoint): DcEstimate {
  const gridIntensity = gridIntensityFor(dc);
  const { capacityMw, pue } = sizingFor(dc);
  const energyGwh = capacityMw * pue * 8.76;
  // kWh = GWh × 1e6; t CO₂ = kWh × g/kWh ÷ 1e6 = GWh × intensity
  const co2Kt = (energyGwh * gridIntensity) / 1000;
  return { gridIntensity, pue, capacityMw, energyGwh, co2Kt };
}

// ── Co-location check ──────────────────────────────────────────────

/** Sites closer than this to an existing facility count as co-located:
 *  they share the same grid feed, cooling water and land constraints. */
export const COLOCATION_KM = 40;

/** Nearest bundled facility within COLOCATION_KM of a site, if any.
 *  Returns the full point (plus the distance) so callers can estimate
 *  the facility's energy/emissions footprint directly. */
export function nearbyDataCenter(
  latLon: { lat: number; lon: number },
): (DataCenterPoint & { distanceKm: number }) | null {
  let best: (DataCenterPoint & { distanceKm: number }) | null = null;
  for (let i = 0; i < BUNDLED_DATA_CENTERS.length; i++) {
    const d = BUNDLED_DATA_CENTERS[i];
    const distanceKm = haversineKm(latLon, { lat: d.lat, lon: d.lon });
    if (distanceKm <= COLOCATION_KM && (!best || distanceKm < best.distanceKm)) {
      best = {
        id: `dc-${i}`,
        name: d.name,
        operator: d.operator,
        lat: d.lat,
        lon: d.lon,
        distanceKm,
      };
    }
  }
  return best;
}
