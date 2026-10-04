/**
 * Approximate country centroids keyed by ISO 3166-1 alpha-3 code
 * (the identifier Climate TRACE uses for `gadmId` at level 0).
 *
 * Used to resolve a clicked lat/lon on the globe to the nearest country
 * so real Climate TRACE emissions data can be attached to a site.
 * Coordinates are 1-decimal approximations — plenty accurate for
 * nearest-centroid matching of user-placed sites.
 *
 * Reference: ISO 3166 / GADM level-0 geometries (approximate centers).
 */

/** ISO3 code -> [latitude, longitude] of the country's rough center. */
export const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  // Europe
  ALB: [41.1, 20.1], AUT: [47.6, 14.1], BEL: [50.6, 4.6], BGR: [42.7, 25.4],
  BIH: [44.1, 17.8], BLR: [53.5, 28.0], CHE: [46.8, 8.2], CZE: [49.8, 15.4],
  DEU: [51.1, 10.4], DNK: [56.0, 10.0], ESP: [40.2, -3.6], EST: [58.7, 25.5],
  FIN: [64.5, 26.0], FRA: [46.6, 2.4], GBR: [54.0, -2.5], GRC: [39.1, 22.0],
  HRV: [45.6, 16.4], HUN: [47.2, 19.4], IRL: [53.2, -8.1], ISL: [64.9, -18.6],
  ITA: [42.8, 12.8], LTU: [55.3, 23.9], LUX: [49.8, 6.1], LVA: [56.9, 24.9],
  MDA: [47.2, 28.5], MKD: [41.6, 21.7], MNE: [42.8, 19.2], NLD: [52.2, 5.5],
  NOR: [61.5, 9.0], POL: [52.1, 19.4], PRT: [39.6, -8.0], ROU: [45.9, 25.0],
  RUS: [61.5, 99.0], SRB: [44.2, 20.8], SVK: [48.7, 19.7], SVN: [46.1, 14.8],
  SWE: [60.1, 15.0],
  UKR: [48.4, 31.2], XKX: [42.6, 20.9], CYP: [35.0, 33.2], MLT: [35.9, 14.4],

  // Americas
  ARG: [-35.4, -65.2], BHS: [24.7, -77.8], BLZ: [17.2, -88.5], BOL: [-16.7, -64.7],
  BRA: [-10.8, -52.9], CAN: [56.1, -96.3], CHL: [-35.7, -71.3], COL: [3.9, -73.1],
  CRI: [9.9, -84.1], CUB: [21.5, -79.6], DOM: [18.9, -70.5], ECU: [-1.4, -78.4],
  GTM: [15.7, -90.4], HND: [14.8, -86.6], HTI: [19.1, -72.7], MEX: [23.6, -102.5],
  NIC: [12.9, -85.0], PAN: [8.5, -80.1], PER: [-9.2, -74.4], PRY: [-23.2, -58.4],
  SLV: [13.8, -88.9], SUR: [4.1, -56.0], TTO: [10.4, -61.3], URY: [-32.8, -56.0],
  USA: [39.8, -98.6], VEN: [6.4, -66.6], GUY: [4.8, -58.9], JAM: [18.1, -77.3],

  // Asia
  AFG: [33.8, 66.0], ARE: [23.9, 54.3], ARM: [40.3, 45.0], AZE: [40.3, 47.7],
  BGD: [23.7, 90.3], BHR: [26.0, 50.5], BRN: [4.5, 114.7], BTN: [27.4, 90.4],
  CHN: [35.5, 103.9], GEO: [42.2, 43.5], IDN: [-2.2, 117.4], IND: [22.4, 79.6],
  IRN: [32.6, 54.3], IRQ: [33.0, 43.8], ISR: [31.4, 35.0], JOR: [31.3, 36.8],
  JPN: [36.6, 138.1], KAZ: [48.2, 67.3], KGZ: [41.5, 74.5], KHM: [12.6, 105.0],
  KOR: [36.5, 127.9], KWT: [29.3, 47.6], LAO: [18.5, 103.9], LBN: [33.9, 35.9],
  LKA: [7.6, 80.7], MMR: [21.2, 96.5], MNG: [46.8, 103.1], MYS: [3.8, 109.7],
  NPL: [28.3, 84.0], OMN: [20.6, 56.1], PAK: [29.9, 69.4], PHL: [12.9, 122.9],
  PRK: [40.1, 127.2], QAT: [25.3, 51.2], SAU: [24.1, 44.5], SGP: [1.35, 103.8],
  SYR: [35.0, 38.5], THA: [15.1, 101.0], TJK: [38.5, 71.0], TKM: [39.1, 59.4],
  TLS: [-8.8, 125.9], TUR: [39.0, 35.3], TWN: [23.7, 121.0], UZB: [41.7, 63.7],
  VNM: [16.6, 106.3], YEM: [15.6, 47.9], HKG: [22.35, 114.1], MAC: [22.16, 113.55],

  // Africa
  AGO: [-12.3, 17.5], BDI: [-3.4, 29.9], BEN: [9.6, 2.3], BFA: [12.3, -1.7],
  BWA: [-22.2, 23.8], CAF: [6.6, 20.5], CIV: [7.6, -5.6], CMR: [5.7, 12.7],
  COD: [-2.9, 23.7], COG: [-0.8, 15.2], DJI: [11.7, 42.6], DZA: [28.0, 2.6],
  EGY: [26.6, 29.9], ERI: [15.4, 38.8], ETH: [8.6, 39.6], GAB: [-0.6, 11.6],
  GHA: [7.9, -1.2], GIN: [10.4, -11.0], GMB: [13.4, -15.4], GNB: [12.0, -15.0],
  SDN: [15.5, 30.2],
  GNQ: [1.6, 10.3], KEN: [0.5, 37.9], LBR: [6.4, -9.3], LBY: [26.9, 17.5],
  LSO: [-29.6, 28.2], MAR: [31.9, -6.9], MDG: [-19.0, 46.7], MLI: [17.4, -4.0],
  MOZ: [-18.7, 35.5], MRT: [20.3, -10.3], MWI: [-13.2, 34.3], NAM: [-22.1, 17.2],
  NER: [17.4, 9.4], NGA: [9.6, 8.1], RWA: [-2.0, 29.9], SEN: [14.4, -14.5],
  SLE: [8.5, -11.8], SOM: [6.1, 45.9], SSD: [7.3, 30.3], SWZ: [-26.5, 31.5],
  TCD: [15.4, 18.7], TGO: [8.5, 1.0], TUN: [34.1, 9.6], TZA: [-6.3, 34.8],
  UGA: [1.3, 32.4], ZAF: [-29.0, 25.1], ZMB: [-13.5, 27.8], ZWE: [-19.0, 29.9],

  // Oceania
  AUS: [-25.3, 133.8], FJI: [-17.7, 178.0], NZL: [-41.8, 172.8],
  PNG: [-6.5, 145.2], SLB: [-9.6, 160.2], VUT: [-16.7, 168.3], NCL: [-21.3, 165.6],

  // Large territories outside the Climate TRACE ranking sets, needed so
  // the overlay covers them and clicks don't fall through to null.
  GRL: [71.7, -42.6],
};

/** ISO3 code -> the name Climate TRACE uses in rankings responses. */
export const ISO3_TO_CT_NAME: Record<string, string> = {
  BGR: 'Bulgaria', DEU: 'Germany', GBR: 'United Kingdom of Great Britain and Northern Ireland',
  USA: 'United States of America', RUS: 'Russian Federation', TUR: 'Turkey',
  CZE: 'Czechia', KOR: 'Republic of Korea', PRK: 'Democratic People\'s Republic of Korea',
  VNM: 'Viet Nam', IRN: 'Iran (Islamic Republic of)', SYR: 'Syrian Arab Republic',
  LAO: 'Lao People\'s Democratic Republic', MDA: 'Republic of Moldova',
  BOL: 'Bolivia (Plurinational State of)', VEN: 'Venezuela (Bolivarian Republic of)',
  TZA: 'United Republic of Tanzania', MDA_ALT: 'Republic of Moldova',
  BRN: 'Brunei Darussalam', COD: 'Democratic Republic of the Congo',
  COG: 'Congo', CIV: 'Côte d\'Ivoire', GMB: 'Gambia', BHS: 'Bahamas',
  TLS: 'Timor-Leste', MKD: 'The former Yugoslav Republic of Macedonia',
  SWZ: 'Eswatini', CPV: 'Cabo Verde', XKX: 'Republic of Kosovo',
  TWN: 'Taiwan', HKG: 'China, Hong Kong Special Administrative Region',
  MAC: 'China, Macao Special Administrative Region',
};

/** Resolve the ISO3 country code nearest to a clicked lat/lon.
 *  Returns null for points far from any centroid (open ocean etc.). */
export function nearestCountry(lat: number, lon: number): string | null {
  // Longitude degrees shrink with latitude; without the cos scaling a
  // degree of longitude would weigh as much as a degree of latitude and
  // mid-latitude sites would match the wrong neighbour (e.g. Sofia read
  // as Skopje).
  const lonScale = Math.cos((lat * Math.PI) / 180);
  let best: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [iso3, [cLat, cLon]] of Object.entries(COUNTRY_CENTROIDS)) {
    const dLat = lat - cLat;
    let dLon = lon - cLon;
    // wrap longitude across the antimeridian
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const dist = dLat * dLat + (dLon * lonScale) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = iso3;
    }
  }
  // Reject matches more than ~15° from any centroid (mid-ocean clicks).
  return bestDist <= 15 * 15 ? best : null;
}
