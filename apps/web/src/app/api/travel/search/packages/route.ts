import { estimatePackages, packageQuerySchema } from "@northstar/travel-search";
import { handle } from "@/lib/http";
import { requireProductOrApp } from "@/lib/product";
import { estimateResponse } from "@/lib/travel-search";

/** Estimated flight + hotel: the cheapest estimated return flight with each place to stay. */
export async function GET(req: Request) {
  return handle(async () => {
    await requireProductOrApp("travel");
    return estimateResponse(req, packageQuerySchema, (q, today) =>
      estimatePackages({ from: q.from, to: q.to, depart: q.depart, returnDate: q.return, adults: q.adults }, today),
    );
  });
}
