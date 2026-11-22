import { getDestination } from "@northstar/destinations";
import { planRandomTrip, randomTripQuerySchema } from "@northstar/travel-search";
import { handle } from "@/lib/http";
import { partnerLinksFor } from "@/lib/partner-links";
import { requireProductOrApp } from "@/lib/product";
import { appUrl, getDb, getTravelPartners } from "@/lib/providers";
import { estimateResponse } from "@/lib/travel-search";

/**
 * A random trip (docs/TRAVEL-HUB.md, phase 1c): our estimates for where, when, the flight and the
 * stay, plus "things to do" as partner referral links, which never carry a price.
 */
export async function GET(req: Request) {
  return handle(async () => {
    await requireProductOrApp("travel");
    return estimateResponse(req, randomTripQuerySchema, async (q, today) => {
      const trip = planRandomTrip(
        {
          criteria: {
            from: q.from,
            region: q.region ?? null,
            month: q.month ?? null,
            budgetPerPersonMinor: q.budget === undefined ? null : q.budget * 100,
            nights: q.nights,
            adults: q.adults,
          },
          seed: q.seed,
          rolls: { where: q.rollWhere, when: q.rollWhen, flight: q.rollFlight, stay: q.rollStay },
          locks: { where: q.lockWhere, when: q.lockWhen, flight: q.lockFlight, stay: q.lockStay },
        },
        today,
      );
      const destination = trip.destination.destinationSlug ? getDestination(trip.destination.destinationSlug) : null;
      const thingsToDo = destination
        ? await partnerLinksFor(getDb(), getTravelPartners(), destination, "random-trip", appUrl("travel"), ["activities"])
        : null;
      return {
        trip,
        thingsToDo: thingsToDo
          ? {
              notice: thingsToDo.notice,
              links: thingsToDo.groups.flatMap((g) =>
                g.links.map((l) => ({ label: l.label, url: l.url, test: l.test, disclosure: l.disclosure })),
              ),
            }
          : { notice: "", links: [] },
      };
    });
  });
}
