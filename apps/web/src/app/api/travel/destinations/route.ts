import { listDestinations } from "@northstar/destinations";
import { handle } from "@/lib/http";
import { requireProductOrApp } from "@/lib/product";

/** Travel Hub destinations, for the Travel host and the signed-in native app. */
export async function GET() {
  return handle(async () => {
    await requireProductOrApp("travel");
    const destinations = listDestinations().map((d) => ({
      slug: d.slug,
      name: d.name,
      countryCode: d.countryCode,
      summary: d.summary,
    }));
    return Response.json({ destinations });
  });
}
