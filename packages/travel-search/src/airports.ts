/**
 * Airports the estimate model knows: UK departure airports, the airports of the ten Travel Hub
 * destinations, and stop-over hubs. Positions are for distances only; `utcOffset` is the
 * standard (winter) offset in hours, good enough for estimated local times.
 */
export type AirportRole = "origin" | "destination" | "hub";

export interface Airport {
  /** IATA code. */
  code: string;
  /** City or area travellers know it by. */
  city: string;
  name: string;
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  lat: number;
  lon: number;
  utcOffset: number;
  roles: readonly AirportRole[];
  /** The Travel Hub destination it serves, for destination airports. */
  destinationSlug: string | null;
}

type Row = [code: string, city: string, name: string, cc: string, lat: number, lon: number, utc: number, roles: AirportRole[], slug: string | null];

const rows: Row[] = [
  // UK departure airports.
  ["LHR", "London", "Heathrow", "GB", 51.47, -0.454, 0, ["origin", "hub"], null],
  ["LGW", "London", "Gatwick", "GB", 51.153, -0.182, 0, ["origin"], null],
  ["STN", "London", "Stansted", "GB", 51.885, 0.235, 0, ["origin"], null],
  ["LTN", "London", "Luton", "GB", 51.875, -0.368, 0, ["origin"], null],
  ["MAN", "Manchester", "Manchester", "GB", 53.354, -2.275, 0, ["origin"], null],
  ["BHX", "Birmingham", "Birmingham", "GB", 52.454, -1.748, 0, ["origin"], null],
  ["BRS", "Bristol", "Bristol", "GB", 51.383, -2.719, 0, ["origin"], null],
  ["NCL", "Newcastle", "Newcastle", "GB", 55.037, -1.692, 0, ["origin"], null],
  ["EDI", "Edinburgh", "Edinburgh", "GB", 55.95, -3.373, 0, ["origin"], null],
  ["GLA", "Glasgow", "Glasgow", "GB", 55.872, -4.433, 0, ["origin"], null],
  ["BFS", "Belfast", "Belfast International", "GB", 54.658, -6.216, 0, ["origin"], null],
  // Destination airports.
  ["HND", "Tokyo", "Haneda", "JP", 35.549, 139.78, 9, ["destination"], "japan"],
  ["KIX", "Osaka", "Kansai", "JP", 34.427, 135.244, 9, ["destination"], "japan"],
  ["JFK", "New York", "John F. Kennedy", "US", 40.641, -73.778, -5, ["destination"], "usa"],
  ["MCO", "Orlando", "Orlando", "US", 28.431, -81.308, -5, ["destination"], "usa"],
  ["LAX", "Los Angeles", "Los Angeles", "US", 33.942, -118.408, -8, ["destination"], "usa"],
  ["SFO", "San Francisco", "San Francisco", "US", 37.622, -122.379, -8, ["destination"], "usa"],
  ["MAD", "Madrid", "Barajas", "ES", 40.498, -3.568, 1, ["destination"], "spain"],
  ["BCN", "Barcelona", "El Prat", "ES", 41.297, 2.083, 1, ["destination"], "spain"],
  ["AGP", "Málaga", "Málaga", "ES", 36.675, -4.499, 1, ["destination"], "spain"],
  ["ALC", "Alicante", "Alicante", "ES", 38.282, -0.558, 1, ["destination"], "spain"],
  ["PMI", "Palma", "Palma de Mallorca", "ES", 39.552, 2.739, 1, ["destination"], "spain"],
  ["CDG", "Paris", "Charles de Gaulle", "FR", 49.01, 2.548, 1, ["destination", "hub"], "france"],
  ["NCE", "Nice", "Côte d'Azur", "FR", 43.658, 7.216, 1, ["destination"], "france"],
  ["BOD", "Bordeaux", "Mérignac", "FR", 44.828, -0.715, 1, ["destination"], "france"],
  ["FCO", "Rome", "Fiumicino", "IT", 41.8, 12.239, 1, ["destination"], "italy"],
  ["MXP", "Milan", "Malpensa", "IT", 45.63, 8.723, 1, ["destination"], "italy"],
  ["VCE", "Venice", "Marco Polo", "IT", 45.505, 12.352, 1, ["destination"], "italy"],
  ["NAP", "Naples", "Naples", "IT", 40.886, 14.291, 1, ["destination"], "italy"],
  ["ATH", "Athens", "Athens", "GR", 37.936, 23.947, 2, ["destination"], "greece"],
  ["HER", "Heraklion", "Heraklion", "GR", 35.34, 25.18, 2, ["destination"], "greece"],
  ["RHO", "Rhodes", "Rhodes", "GR", 36.405, 28.086, 2, ["destination"], "greece"],
  ["CFU", "Corfu", "Corfu", "GR", 39.602, 19.912, 2, ["destination"], "greece"],
  ["LIS", "Lisbon", "Humberto Delgado", "PT", 38.774, -9.134, 0, ["destination"], "portugal"],
  ["OPO", "Porto", "Francisco Sá Carneiro", "PT", 41.248, -8.681, 0, ["destination"], "portugal"],
  ["FAO", "Faro", "Faro", "PT", 37.017, -7.966, 0, ["destination"], "portugal"],
  ["IST", "Istanbul", "Istanbul", "TR", 41.262, 28.742, 3, ["destination", "hub"], "turkey"],
  ["AYT", "Antalya", "Antalya", "TR", 36.899, 30.801, 3, ["destination"], "turkey"],
  ["DLM", "Dalaman", "Dalaman", "TR", 36.713, 28.792, 3, ["destination"], "turkey"],
  ["BKK", "Bangkok", "Suvarnabhumi", "TH", 13.69, 100.75, 7, ["destination"], "thailand"],
  ["HKT", "Phuket", "Phuket", "TH", 8.113, 98.317, 7, ["destination"], "thailand"],
  ["DXB", "Dubai", "Dubai", "AE", 25.253, 55.365, 4, ["destination", "hub"], "uae"],
  ["AUH", "Abu Dhabi", "Zayed", "AE", 24.433, 54.651, 4, ["destination"], "uae"],
  // Stop-over hubs only.
  ["AMS", "Amsterdam", "Schiphol", "NL", 52.31, 4.768, 1, ["hub"], null],
  ["FRA", "Frankfurt", "Frankfurt", "DE", 50.038, 8.562, 1, ["hub"], null],
  ["DOH", "Doha", "Hamad", "QA", 25.273, 51.608, 3, ["hub"], null],
];

export const airports: readonly Airport[] = Object.freeze(
  rows.map(([code, city, name, countryCode, lat, lon, utcOffset, roles, destinationSlug]) =>
    Object.freeze({ code, city, name, countryCode, lat, lon, utcOffset, roles, destinationSlug }),
  ),
);

const byCode = new Map(airports.map((a) => [a.code, a]));

export function getAirport(code: string): Airport | null {
  return byCode.get(code.toUpperCase()) ?? null;
}

export function originAirports(): Airport[] {
  return airports.filter((a) => a.roles.includes("origin"));
}

export function destinationAirports(): Airport[] {
  return airports.filter((a) => a.roles.includes("destination"));
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: Pick<Airport, "lat" | "lon">, b: Pick<Airport, "lat" | "lon">): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
