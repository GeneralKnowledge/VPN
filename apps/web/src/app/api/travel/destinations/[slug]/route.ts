import { entryRequirementsUrl, getDestination } from "@northstar/destinations";
import { HttpError, handle } from "@/lib/http";
import { requireProductOrApp } from "@/lib/product";
import { appUrl } from "@/lib/providers";
import { esimPlansUrl, packagesForDestination } from "@/lib/travel";

/** One destination with its facts and our eSIM packages there. eSIM checkout stays on its own routes. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    await requireProductOrApp("travel");
    const destination = getDestination((await params).slug);
    if (!destination) throw new HttpError(404, "Unknown destination");
    const esim = await packagesForDestination(destination);
    return Response.json({
      destination: {
        ...destination,
        entryRequirementsUrl: entryRequirementsUrl(destination),
        reviewed: destination.review !== null,
      },
      esim: {
        available: esim.ok,
        packages: esim.packages,
        plansUrl: esimPlansUrl(appUrl("esim"), destination.countryCode),
      },
    });
  });
}
