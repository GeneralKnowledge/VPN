import { estimatePriceMap, priceMapQuerySchema } from "@northstar/travel-search";
import { handle } from "@/lib/http";
import { requireProductOrApp } from "@/lib/product";
import { estimateResponse } from "@/lib/travel-search";

/** The cheapest estimated economy return per person from `from` to each destination airport in `month`. */
export async function GET(req: Request) {
  return handle(async () => {
    await requireProductOrApp("travel");
    return estimateResponse(req, priceMapQuerySchema, (q, today) => ({
      from: q.from,
      month: q.month,
      pins: estimatePriceMap(q.from, q.month, today),
    }));
  });
}
