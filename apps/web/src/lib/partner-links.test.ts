import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, migrate, outboundLinks, partnerEvents, type Db } from "@northstar/db";
import { MOCK_PARTNER, createPartnerAdapters, type PartnerAdapter } from "@northstar/travel-partners";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ctx = vi.hoisted(() => ({ db: null as unknown, adapters: [] as unknown[] }));

vi.mock("@/lib/providers", () => ({
  getDb: () => ctx.db,
  getTravelPartners: () => ctx.adapters,
}));

import { CLICK_RETENTION_DAYS, followPartnerLink, partnerLinksFor, purgeOldPartnerClicks } from "@/lib/partner-links";
import { GET as go } from "@/app/travel/go/[linkId]/route";

const BASE = "https://travel.example.com";
const japan = { slug: "japan", name: "Japan", countryCode: "JP" };
const mock = () => createPartnerAdapters(["mock"], { travelBaseUrl: BASE });
const params = (linkId: string) => ({ params: Promise.resolve({ linkId }) });

describe("partner links", () => {
  let db: Db;

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-partners-"));
    const url = `file:${path.join(dir, "t.db")}`;
    process.env.NORTHSTAR_ROOT = dir;
    migrate(url);
    db = createDb(url).db;
    ctx.db = db;
    ctx.adapters = mock();
  });

  it("offers each category once per partner, and writes each link once", async () => {
    const first = await partnerLinksFor(db, mock(), japan, "destination-page", BASE);
    expect(first.groups.map((g) => g.title)).toEqual(["Flights", "Places to stay", "Car hire"]);
    const link = first.groups[0]!.links[0]!;
    expect(link.path).toBe(`/go/${link.id}`);
    expect(link.url).toBe(`${BASE}/go/${link.id}`);

    const again = await partnerLinksFor(db, mock(), japan, "destination-page", BASE);
    expect(again.groups[0]!.links[0]!.id).toBe(link.id);
    expect(await db.select().from(outboundLinks)).toHaveLength(3);
  });

  it("shows nothing when no partner is switched on", async () => {
    expect((await partnerLinksFor(db, [], japan, "destination-page", BASE)).groups).toEqual([]);
  });

  it("records a click with no personal data and passes only a random click id", async () => {
    const { groups } = await partnerLinksFor(db, mock(), japan, "destination-page", BASE);
    const id = groups[0]!.links[0]!.id;
    const target = new URL((await followPartnerLink(db, mock(), id))!);
    expect(target.origin).toBe(BASE);
    expect(target.pathname).toBe("/partner-preview");
    const clickId = target.searchParams.get("subid")!;
    expect(clickId).toMatch(/^clk_[0-9a-f]{16}$/);

    const [event] = await db.select().from(partnerEvents);
    expect(Object.keys(event!).sort()).toEqual(
      ["category", "createdAt", "destinationSlug", "id", "kind", "linkId", "partnerId", "placement"].sort(),
    );
    expect(event).toMatchObject({ id: clickId, kind: "outbound_click", linkId: id, partnerId: "mock", category: "flights" });
  });

  it("refuses unknown links and partners that are paused or switched off", async () => {
    const { groups } = await partnerLinksFor(db, mock(), japan, "destination-page", BASE);
    const id = groups[0]!.links[0]!.id;
    expect(await followPartnerLink(db, mock(), "lnk_000000000000000000000000")).toBeNull();
    expect(await followPartnerLink(db, mock(), "https://evil.example")).toBeNull();
    expect(await followPartnerLink(db, [], id)).toBeNull();
    const paused: PartnerAdapter = { ...mock()[0]!, partner: { ...MOCK_PARTNER, status: "paused" } };
    expect(await followPartnerLink(db, [paused], id)).toBeNull();
    expect(await db.select().from(partnerEvents)).toHaveLength(0);
  });

  it("redirects from /go/<id> to the stored URL only, never one from the request", async () => {
    const { groups } = await partnerLinksFor(db, mock(), japan, "destination-page", BASE);
    const id = groups[1]!.links[0]!.id;
    const res = await go(new Request(`${BASE}/go/${id}?url=https://evil.example/&to=https://evil.example/`), params(id));
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe(BASE);
    expect(location.searchParams.get("category")).toBe("stays");

    const missing = await go(new Request(`${BASE}/go/nope?url=https://evil.example/`), params("nope"));
    expect(missing.status).toBe(404);
    expect(missing.headers.get("location")).toBeNull();
    expect(await missing.text()).toMatch(/isn't available/);
  });

  it("deletes clicks older than the retention period", async () => {
    const { groups } = await partnerLinksFor(db, mock(), japan, "destination-page", BASE);
    const id = groups[0]!.links[0]!.id;
    await followPartnerLink(db, mock(), id);
    await followPartnerLink(db, mock(), id);
    const day = 24 * 60 * 60 * 1000;
    const [old] = await db.select().from(partnerEvents).limit(1);
    const { eq } = await import("drizzle-orm");
    await db
      .update(partnerEvents)
      .set({ createdAt: new Date(Date.now() - (CLICK_RETENTION_DAYS + 1) * day) })
      .where(eq(partnerEvents.id, old!.id));
    expect(await purgeOldPartnerClicks(db)).toBe(1);
    expect(await db.select().from(partnerEvents)).toHaveLength(1);
  });
});
