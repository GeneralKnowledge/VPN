import { estimateFlights, flightQuerySchema } from "@northstar/travel-search";
import { handle } from "@/lib/http";
import { requireProductOrApp } from "@/lib/product";
import { estimateResponse } from "@/lib/travel-search";

/** Estimated flights (simulated, never a partner's price). */
export async function GET(req: Request) {
  return handle(async () => {
    await requireProductOrApp("travel");
    return estimateResponse(req, flightQuerySchema, (q, today) => ({
      options: estimateFlights(
        { from: q.from, to: q.to, depart: q.depart, returnDate: q.return ?? null, adults: q.adults, cabin: q.cabin, sort: q.sort },
        today,
      ),
    }));
  });
}
