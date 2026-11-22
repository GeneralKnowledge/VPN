import { estimateStays, stayQuerySchema } from "@northstar/travel-search";
import { handle } from "@/lib/http";
import { requireProductOrApp } from "@/lib/product";
import { estimateResponse } from "@/lib/travel-search";

/** Estimated places to stay (simulated: no real hotels, names or reviews). */
export async function GET(req: Request) {
  return handle(async () => {
    await requireProductOrApp("travel");
    return estimateResponse(req, stayQuerySchema, (q, today) => ({ options: estimateStays(q, today) }));
  });
}
