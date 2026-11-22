import { describe, expect, it } from "vitest";
import {
  MOCK_PARTNER,
  createPartnerAdapters,
  linkId,
  linkLabel,
  partnerServes,
  partnersFor,
  type LinkRequest,
  type PartnerAdapter,
  type TravelPartner,
} from "./index";

const japan = { slug: "japan", name: "Japan", countryCode: "JP" };
const request = (over: Partial<LinkRequest> = {}): LinkRequest => ({
  category: "flights",
  destination: japan,
  placement: "destination-page",
  ...over,
});

function fake(partner: Partial<TravelPartner>): PartnerAdapter {
  return {
    partner: { ...MOCK_PARTNER, test: false, ...partner },
    linkUrl: () => "https://partner.example/",
    withClickId: (url) => url,
  };
}

describe("partners", () => {
  it("only builds the partners switched on", () => {
    expect(createPartnerAdapters([], { travelBaseUrl: "https://travel.example.com" })).toEqual([]);
    expect(createPartnerAdapters(["mock", "unknown"], { travelBaseUrl: "https://travel.example.com" })).toHaveLength(1);
  });

  it("keeps the test partner on our own site", () => {
    const [mock] = createPartnerAdapters(["mock"], { travelBaseUrl: "https://travel.example.com" });
    const url = new URL(mock!.linkUrl(request()));
    expect(url.origin).toBe("https://travel.example.com");
    expect(url.pathname).toBe("/partner-preview");
    expect(url.searchParams.get("destination")).toBe("japan");
    const clicked = new URL(mock!.withClickId(url.toString(), "clk_abc"));
    expect(clicked.searchParams.get("subid")).toBe("clk_abc");
    expect(mock!.partner.test).toBe(true);
  });

  it("shows only approved partners, in their categories and markets", () => {
    expect(partnerServes(MOCK_PARTNER, "flights", "JP")).toBe(true);
    expect(partnerServes(MOCK_PARTNER, "parking", "JP")).toBe(false);
    expect(partnerServes({ ...MOCK_PARTNER, status: "paused" }, "flights", "JP")).toBe(false);
    expect(partnerServes({ ...MOCK_PARTNER, status: "draft" }, "flights", "JP")).toBe(false);
    expect(partnerServes({ ...MOCK_PARTNER, markets: ["ES"] }, "flights", "JP")).toBe(false);
    expect(partnerServes({ ...MOCK_PARTNER, markets: ["ES"] }, "flights", "ES")).toBe(true);
  });

  it("orders partners by name, never by anything else", () => {
    const adapters = [fake({ id: "z", displayName: "Zebra" }), fake({ id: "a", displayName: "Aardvark" })];
    expect(partnersFor(adapters, "flights", "JP").map((a) => a.partner.id)).toEqual(["a", "z"]);
  });

  it("gives a link the same id every time, and a different one per placement", () => {
    expect(linkId("mock", request())).toBe(linkId("mock", request()));
    expect(linkId("mock", request())).toMatch(/^lnk_[0-9a-f]{24}$/);
    expect(linkId("mock", request({ placement: "app-destination" }))).not.toBe(linkId("mock", request()));
    expect(linkId("mock", request({ category: "stays" }))).not.toBe(linkId("mock", request()));
  });

  it("labels a link with what it does and no price", () => {
    expect(linkLabel(MOCK_PARTNER, request())).toBe("Search flights to Japan on Test Partner");
    expect(linkLabel(MOCK_PARTNER, request({ category: "stays" }))).not.toMatch(/£|\d/);
  });
});
