/**
 * Approximate city / country coordinates for map dots.
 * VPNresellers does not publish lat/lng — we place servers at city centres
 * (or country centroids when the city is unknown).
 */

export type Coords = { latitude: number; longitude: number };

/** Normalise city names for lookup (lowercase, strip diacritics / punctuation). */
export function normaliseCityKey(city: string): string {
  return city
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Well-known VPN city centres (WGS84). */
const CITY_COORDS: Record<string, Coords> = {
  "gb|london": { latitude: 51.5074, longitude: -0.1278 },
  "gb|manchester": { latitude: 53.4808, longitude: -2.2426 },
  "de|frankfurt": { latitude: 50.1109, longitude: 8.6821 },
  "de|berlin": { latitude: 52.52, longitude: 13.405 },
  "nl|amsterdam": { latitude: 52.3676, longitude: 4.9041 },
  "ch|zurich": { latitude: 47.3769, longitude: 8.5417 },
  "fr|paris": { latitude: 48.8566, longitude: 2.3522 },
  "se|stockholm": { latitude: 59.3293, longitude: 18.0686 },
  "no|oslo": { latitude: 59.9139, longitude: 10.7522 },
  "dk|copenhagen": { latitude: 55.6761, longitude: 12.5683 },
  "ie|dublin": { latitude: 53.3498, longitude: -6.2603 },
  "es|madrid": { latitude: 40.4168, longitude: -3.7038 },
  "es|barcelona": { latitude: 41.3874, longitude: 2.1686 },
  "it|milan": { latitude: 45.4642, longitude: 9.19 },
  "it|rome": { latitude: 41.9028, longitude: 12.4964 },
  "pl|warsaw": { latitude: 52.2297, longitude: 21.0122 },
  "cz|prague": { latitude: 50.0755, longitude: 14.4378 },
  "at|vienna": { latitude: 48.2082, longitude: 16.3738 },
  "be|brussels": { latitude: 50.8503, longitude: 4.3517 },
  "fi|helsinki": { latitude: 60.1699, longitude: 24.9384 },
  "pt|lisbon": { latitude: 38.7223, longitude: -9.1393 },
  "ro|bucharest": { latitude: 44.4268, longitude: 26.1025 },
  "hu|budapest": { latitude: 47.4979, longitude: 19.0402 },
  "us|new york": { latitude: 40.7128, longitude: -74.006 },
  "us|los angeles": { latitude: 34.0522, longitude: -118.2437 },
  "us|chicago": { latitude: 41.8781, longitude: -87.6298 },
  "us|miami": { latitude: 25.7617, longitude: -80.1918 },
  "us|dallas": { latitude: 32.7767, longitude: -96.797 },
  "us|seattle": { latitude: 47.6062, longitude: -122.3321 },
  "us|ashburn": { latitude: 39.0438, longitude: -77.4874 },
  "ca|toronto": { latitude: 43.6532, longitude: -79.3832 },
  "ca|montreal": { latitude: 45.5017, longitude: -73.5673 },
  "ca|vancouver": { latitude: 49.2827, longitude: -123.1207 },
  "jp|tokyo": { latitude: 35.6762, longitude: 139.6503 },
  "jp|osaka": { latitude: 34.6937, longitude: 135.5023 },
  "sg|singapore": { latitude: 1.3521, longitude: 103.8198 },
  "hk|hong kong": { latitude: 22.3193, longitude: 114.1694 },
  "au|sydney": { latitude: -33.8688, longitude: 151.2093 },
  "au|melbourne": { latitude: -37.8136, longitude: 144.9631 },
  "nz|auckland": { latitude: -36.8509, longitude: 174.7645 },
  "in|mumbai": { latitude: 19.076, longitude: 72.8777 },
  "kr|seoul": { latitude: 37.5665, longitude: 126.978 },
  "tw|taipei": { latitude: 25.033, longitude: 121.5654 },
  "br|sao paulo": { latitude: -23.5505, longitude: -46.6333 },
  "mx|mexico city": { latitude: 19.4326, longitude: -99.1332 },
  "za|johannesburg": { latitude: -26.2041, longitude: 28.0473 },
  "ae|dubai": { latitude: 25.2048, longitude: 55.2708 },
  "il|tel aviv": { latitude: 32.0853, longitude: 34.7818 },
  "tr|istanbul": { latitude: 41.0082, longitude: 28.9784 },
};

/** Country geographic centroids used when a city is not in CITY_COORDS. */
const COUNTRY_CENTROIDS: Record<string, Coords> = {
  GB: { latitude: 54.5, longitude: -2.5 },
  DE: { latitude: 51.16, longitude: 10.45 },
  NL: { latitude: 52.13, longitude: 5.29 },
  CH: { latitude: 46.82, longitude: 8.23 },
  FR: { latitude: 46.23, longitude: 2.21 },
  SE: { latitude: 60.13, longitude: 18.64 },
  NO: { latitude: 60.47, longitude: 8.47 },
  DK: { latitude: 56.26, longitude: 9.5 },
  IE: { latitude: 53.14, longitude: -7.69 },
  ES: { latitude: 40.46, longitude: -3.75 },
  IT: { latitude: 41.87, longitude: 12.57 },
  PL: { latitude: 51.92, longitude: 19.15 },
  CZ: { latitude: 49.82, longitude: 15.47 },
  AT: { latitude: 47.52, longitude: 14.55 },
  BE: { latitude: 50.5, longitude: 4.47 },
  FI: { latitude: 61.92, longitude: 25.75 },
  PT: { latitude: 39.4, longitude: -8.22 },
  RO: { latitude: 45.94, longitude: 24.97 },
  HU: { latitude: 47.16, longitude: 19.5 },
  US: { latitude: 39.83, longitude: -98.58 },
  CA: { latitude: 56.13, longitude: -106.35 },
  JP: { latitude: 36.2, longitude: 138.25 },
  SG: { latitude: 1.35, longitude: 103.82 },
  HK: { latitude: 22.32, longitude: 114.17 },
  AU: { latitude: -25.27, longitude: 133.78 },
  NZ: { latitude: -40.9, longitude: 174.89 },
  IN: { latitude: 20.59, longitude: 78.96 },
  KR: { latitude: 35.91, longitude: 127.77 },
  TW: { latitude: 23.7, longitude: 120.96 },
  BR: { latitude: -14.24, longitude: -51.93 },
  MX: { latitude: 23.63, longitude: -102.55 },
  ZA: { latitude: -30.56, longitude: 22.94 },
  AE: { latitude: 23.42, longitude: 53.85 },
  IL: { latitude: 31.05, longitude: 34.85 },
  TR: { latitude: 38.96, longitude: 35.24 },
};

/** Rough world centre when country is also unknown. */
const FALLBACK: Coords = { latitude: 20, longitude: 0 };

export function resolveLocationCoords(countryCode: string, city: string): Coords {
  const cc = countryCode.trim().toUpperCase();
  const cityKey = normaliseCityKey(city);
  const cityHit = CITY_COORDS[`${cc.toLowerCase()}|${cityKey}`];
  if (cityHit) return cityHit;
  return COUNTRY_CENTROIDS[cc] ?? FALLBACK;
}

export function projectEquirectangular(
  latitude: number,
  longitude: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const x = ((longitude + 180) / 360) * width;
  const y = ((90 - latitude) / 180) * height;
  return { x, y };
}
