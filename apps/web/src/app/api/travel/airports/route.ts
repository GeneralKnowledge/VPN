import { destinationAirports, originAirports, type Airport } from "@northstar/travel-search";
import { handle } from "@/lib/http";
import { requireProductOrApp } from "@/lib/product";

const view = (a: Airport) => ({
  code: a.code,
  city: a.city,
  name: a.name,
  countryCode: a.countryCode,
  destinationSlug: a.destinationSlug,
  lat: a.lat,
  lon: a.lon,
});

/** Airports for the search forms: UK departure airports, and the airports of our destinations. */
export async function GET() {
  return handle(async () => {
    await requireProductOrApp("travel");
    return Response.json({ origins: originAirports().map(view), destinations: destinationAirports().map(view) });
  });
}
