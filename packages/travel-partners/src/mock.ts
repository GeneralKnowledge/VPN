import type { LinkRequest, PartnerAdapter, TravelPartner } from "./types";

export const MOCK_PARTNER: TravelPartner = {
  id: "mock",
  displayName: "Test Partner",
  network: "test",
  categories: ["flights", "stays", "cars"],
  markets: "*",
  integration: "link",
  disclosure: "Test Partner is not a real company. Its links open a page on this site so the referral flow can be tried end to end.",
  status: "approved",
  test: true,
};

/**
 * A partner for development and testing. Its links go to a page on our own Travel site
 * (`/partner-preview`), never to a real company, so the whole referral flow (link, click record,
 * redirect, disclosure) can run before any programme has accepted us.
 */
export class MockTravelPartner implements PartnerAdapter {
  readonly partner = MOCK_PARTNER;

  constructor(private readonly travelBaseUrl: string) {}

  linkUrl(request: LinkRequest): string {
    const url = new URL("/partner-preview", this.travelBaseUrl);
    url.searchParams.set("category", request.category);
    url.searchParams.set("destination", request.destination.slug);
    return url.toString();
  }

  withClickId(url: string, clickId: string): string {
    const next = new URL(url);
    next.searchParams.set("subid", clickId);
    return next.toString();
  }
}
