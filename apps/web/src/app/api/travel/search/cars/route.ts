import { carQuerySchema, estimateCars } from "@northstar/travel-search";
import { handle } from "@/lib/http";
import { requireProductOrApp } from "@/lib/product";
import { estimateResponse } from "@/lib/travel-search";

/** Estimated car hire at a destination airport (simulated). */
export async function GET(req: Request) {
  return handle(async () => {
    await requireProductOrApp("travel");
    return estimateResponse(req, carQuerySchema, (q, today) => ({
      options: estimateCars({ city: q.city, pickUpDate: q.pickUp, dropOffDate: q.dropOff }, today),
    }));
  });
}
