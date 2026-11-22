/**
 * Travel partners (docs/TRAVEL-HUB.md, phase 2). A partner is a site we send people to through a
 * tracked referral link. Links never carry a price, and commission never decides their order.
 */

export const partnerCategories = ["flights", "stays", "cars", "transfers", "parking", "activities"] as const;
export type PartnerCategory = (typeof partnerCategories)[number];

/** `link` partners get a referral link only; `live` (phase 6) would also give us real results. */
export type IntegrationType = "link" | "live";

/**
 * `draft` until the partner's programme has accepted us and a person has read its terms; only
 * `approved` partners are ever shown. `paused` stops every link at once, including old ones.
 */
export type PartnerStatus = "draft" | "approved" | "paused";

export type TravelPartner = {
  id: string;
  displayName: string;
  /** Where the programme runs: "direct", "travelpayouts", "awin", ... or "test". */
  network: string;
  categories: readonly PartnerCategory[];
  /** ISO country codes the partner serves, or "*" for everywhere. */
  markets: readonly string[] | "*";
  integration: IntegrationType;
  /** Shown next to this partner's links, on top of the shared commission notice. */
  disclosure: string;
  status: PartnerStatus;
  /** A partner that exists only for development and testing; never a real site. */
  test: boolean;
};

/** What a page asks a partner for. Nothing about the person is ever part of it. */
export type LinkRequest = {
  category: PartnerCategory;
  destination: { slug: string; name: string; countryCode: string };
  /** Where on our pages the link sits, e.g. "destination-page" or "app-destination". */
  placement: string;
};

export interface PartnerAdapter {
  readonly partner: TravelPartner;
  /** The partner URL for a request, without any click id. Only adapters build partner URLs. */
  linkUrl(request: LinkRequest): string;
  /**
   * The same URL with our click id added where the partner's programme expects its sub-id. The
   * click id is random; nothing else about the click goes to the partner.
   */
  withClickId(url: string, clickId: string): string;
}
