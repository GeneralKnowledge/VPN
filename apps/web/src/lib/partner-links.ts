import type { Destination } from "@northstar/destinations";
import { outboundLinks, partnerEvents, type Db } from "@northstar/db";
import {
  COMMISSION_NOTICE,
  categoryLabel,
  linkId,
  linkLabel,
  partnersFor,
  type LinkRequest,
  type PartnerAdapter,
  type PartnerCategory,
} from "@northstar/travel-partners";
import { eq, lt } from "drizzle-orm";
import { newId } from "./utils";

/** Raw click records are deleted after this many days (docs/TRAVEL-HUB.md, referral tracking). */
export const CLICK_RETENTION_DAYS = 90;

/** The categories a destination shows, in this order. */
export const DESTINATION_CATEGORIES: readonly PartnerCategory[] = ["flights", "stays", "cars"];

export type PartnerLink = {
  id: string;
  partnerId: string;
  partnerName: string;
  /** What the link does ("Search flights to Japan on ..."). Never a price. */
  label: string;
  /** Our `/go/<id>` path on the Travel host; the partner URL itself never reaches the page. */
  path: string;
  /** The same as a full URL, for the app, which opens it in the browser. */
  url: string;
  /** A partner that exists only for testing. */
  test: boolean;
  disclosure: string;
};

export type PartnerLinkGroup = { category: PartnerCategory; title: string; links: PartnerLink[] };

export type DestinationPartnerLinks = {
  /** The shared commission notice, shown whenever there is at least one link. */
  notice: string;
  groups: PartnerLinkGroup[];
};

/**
 * The partner links for a destination, grouped by category. Each link is written to
 * `outbound_links` (same id for the same partner, category, destination and placement), so
 * `/go/<id>` can redirect only to a URL an adapter built.
 */
export async function partnerLinksFor(
  db: Db,
  adapters: readonly PartnerAdapter[],
  destination: Pick<Destination, "slug" | "name" | "countryCode">,
  placement: string,
  travelBaseUrl: string,
  categories: readonly PartnerCategory[] = DESTINATION_CATEGORIES,
): Promise<DestinationPartnerLinks> {
  const groups: PartnerLinkGroup[] = [];
  for (const category of categories) {
    const links: PartnerLink[] = [];
    for (const adapter of partnersFor(adapters, category, destination.countryCode)) {
      const request: LinkRequest = {
        category,
        destination: { slug: destination.slug, name: destination.name, countryCode: destination.countryCode },
        placement,
      };
      const id = linkId(adapter.partner.id, request);
      const url = adapter.linkUrl(request);
      await db
        .insert(outboundLinks)
        .values({
          id,
          partnerId: adapter.partner.id,
          category,
          destinationSlug: destination.slug,
          placement,
          url,
        })
        .onConflictDoUpdate({ target: outboundLinks.id, set: { url, updatedAt: new Date() } });
      links.push({
        id,
        partnerId: adapter.partner.id,
        partnerName: adapter.partner.displayName,
        label: linkLabel(adapter.partner, request),
        path: `/go/${id}`,
        url: `${travelBaseUrl.replace(/\/$/, "")}/go/${id}`,
        test: adapter.partner.test,
        disclosure: adapter.partner.disclosure,
      });
    }
    if (links.length > 0) groups.push({ category, title: categoryLabel(category), links });
  }
  return { notice: COMMISSION_NOTICE, groups };
}

/**
 * Follow a referral link: record the click and return where to send the person, or null when the
 * link is unknown or its partner is no longer switched on and approved. The click record holds the
 * link's public facts and a random click id, nothing about the person.
 */
export async function followPartnerLink(
  db: Db,
  adapters: readonly PartnerAdapter[],
  id: string,
): Promise<string | null> {
  if (!/^lnk_[0-9a-f]{24}$/.test(id)) return null;
  const [link] = await db.select().from(outboundLinks).where(eq(outboundLinks.id, id)).limit(1);
  if (!link) return null;
  const adapter = adapters.find((a) => a.partner.id === link.partnerId);
  if (!adapter || adapter.partner.status !== "approved") return null;
  const clickId = newId("clk");
  await db.insert(partnerEvents).values({
    id: clickId,
    kind: "outbound_click",
    linkId: link.id,
    partnerId: link.partnerId,
    category: link.category,
    destinationSlug: link.destinationSlug,
    placement: link.placement,
  });
  return adapter.withClickId(link.url, clickId);
}

/** Delete click records older than the retention period. Returns how many went. */
export async function purgeOldPartnerClicks(db: Db, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - CLICK_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(partnerEvents)
    .where(lt(partnerEvents.createdAt, cutoff))
    .returning({ id: partnerEvents.id });
  return deleted.length;
}
