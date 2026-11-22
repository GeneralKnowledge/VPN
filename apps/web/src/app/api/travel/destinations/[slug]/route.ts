import { entryRequirementsUrl, getDestination } from "@northstar/destinations";
import { HttpError, handle } from "@/lib/http";
import { requireProductOrApp } from "@/lib/product";
import { partnerLinksFor } from "@/lib/partner-links";
import { appUrl, getDb, getTravelPartners } from "@/lib/providers";
import { esimPlansUrl, packagesForDestination } from "@/lib/travel";

/**
 * One destination with its facts, our eSIM packages there and referral links to travel partners.
 * eSIM checkout stays on its own routes; partner links go out through the Travel host's `/go/<id>`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    await requireProductOrApp("travel");
    const destination = getDestination((await params).slug);
    if (!destination) throw new HttpError(404, "Unknown destination");
    const esim = await packagesForDestination(destination);
    const partners = await partnerLinksFor(
      getDb(),
      getTravelPartners(),
      destination,
      "app-destination",
      appUrl("travel"),
    );
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
      partners: {
        notice: partners.notice,
        groups: partners.groups.map((group) => ({
          category: group.category,
          title: group.title,
          links: group.links.map((link) => ({
            id: link.id,
            partnerName: link.partnerName,
            label: link.label,
            url: link.url,
            test: link.test,
            disclosure: link.disclosure,
          })),
        })),
      },
    });
  });
}
