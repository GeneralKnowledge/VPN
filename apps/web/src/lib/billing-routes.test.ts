import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { checkoutSessions, createDb, migrate, plans, subscriptions, users, vpnAccounts } from "@northstar/db";
import { MockBillingProvider } from "@northstar/billing";
import { MockVPNProvider } from "@northstar/vpn-provider";
import { MockEmailProvider } from "@northstar/email";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type TestDb = ReturnType<typeof createDb>["db"];

const ctx = vi.hoisted(() => ({
  db: null as unknown,
  billingKind: "mock" as "mock" | "stripe",
  verified: true,
  billing: null as unknown,
  vpn: null as unknown,
  email: null as unknown,
}));

vi.mock("@/lib/providers", () => ({
  getDb: () => ctx.db,
  getEnv: () => ({ BILLING_PROVIDER: ctx.billingKind }),
  getBillingProvider: () => ctx.billing,
  getVpnProvider: () => ctx.vpn,
  getEmailProvider: () => ctx.email,
  emailVerificationRequired: () => !ctx.verified,
  appUrl: () => "http://localhost:3000",
  track: () => undefined,
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    requireUser: async () => {
      const [u] = await (ctx.db as TestDb).select().from(users).where(eq(users.id, "u1"));
      return { ...u!, emailVerifiedAt: ctx.verified ? new Date() : null };
    },
  };
});

import { POST as checkout } from "@/app/api/billing/checkout/route";
import { POST as complete } from "@/app/api/billing/complete/route";
import { POST as cancel } from "@/app/api/billing/cancel/route";

function json(body: unknown) {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function start(planId = "premium-monthly") {
  const res = await checkout(json({ planId }));
  return { res, body: (await res.json()) as { sessionId?: string; error?: string } };
}

describe("billing routes", () => {
  let db: TestDb;

  beforeEach(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-routes-"));
    const url = `file:${path.join(dir, "t.db")}`;
    process.env.NORTHSTAR_ROOT = dir;
    migrate(url);
    db = createDb(url).db;
    ctx.db = db;
    ctx.billingKind = "mock";
    ctx.verified = true;
    ctx.billing = new MockBillingProvider("secret");
    ctx.vpn = new MockVPNProvider();
    ctx.email = new MockEmailProvider();
    await db.insert(plans).values({
      id: "premium-monthly",
      name: "Premium",
      description: "t",
      price: 499,
      currency: "GBP",
      billingInterval: "month",
      featuresJson: "[]",
      maxDevices: 5,
      active: true,
    });
    await db.insert(users).values({
      id: "u1",
      email: "u1@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "customer",
      referralCode: "NORTH-U1",
    });
  });

  it("completes a checkout once and treats a replay as a no-op", async () => {
    const { body } = await start();
    const first = await complete(json({ sessionId: body.sessionId }));
    expect(first.status).toBe(200);
    expect(await db.select().from(subscriptions)).toHaveLength(1);
    expect((await db.select().from(vpnAccounts))[0]?.status).toBe("active");

    const replay = await complete(json({ sessionId: body.sessionId }));
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { alreadyCompleted?: boolean }).alreadyCompleted).toBe(true);
    expect(await db.select().from(subscriptions)).toHaveLength(1);
  });

  it("does not hand out a free subscription by replaying a session after cancelling", async () => {
    const { body } = await start();
    await complete(json({ sessionId: body.sessionId }));
    const cancelled = await cancel(json({ immediate: true }));
    expect(cancelled.status).toBe(200);
    expect((await db.select().from(subscriptions))[0]?.status).toBe("cancelled");

    await complete(json({ sessionId: body.sessionId }));
    const live = (await db.select().from(subscriptions)).filter((s) => s.status === "active");
    expect(live).toHaveLength(0);
  });

  it("lets a customer subscribe again after cancelling (fresh checkout, VPN restored)", async () => {
    const first = await start();
    await complete(json({ sessionId: first.body.sessionId }));
    await cancel(json({ immediate: true }));
    expect((await db.select().from(vpnAccounts))[0]?.status).toBe("disabled");

    const second = await start();
    expect(second.res.status).toBe(200);
    expect(second.body.sessionId).not.toBe(first.body.sessionId);
    await complete(json({ sessionId: second.body.sessionId }));
    expect((await db.select().from(vpnAccounts))[0]?.status).toBe("active");
    expect((await db.select().from(users))[0]?.lifecycle).toBe("active");
  });

  it("refuses a second checkout while a subscription is live", async () => {
    const { body } = await start();
    await complete(json({ sessionId: body.sessionId }));
    const again = await start();
    expect(again.res.status).toBe(409);
  });

  it("refuses to complete checkouts when billing is not the mock provider", async () => {
    const { body } = await start();
    ctx.billingKind = "stripe";
    const res = await complete(json({ sessionId: body.sessionId }));
    expect(res.status).toBe(400);
    expect(await db.select().from(subscriptions)).toHaveLength(0);
  });

  it("will not complete someone else's or an unknown checkout", async () => {
    const res = await complete(json({ sessionId: "cs_mock_doesnotexist" }));
    expect(res.status).toBe(404);
    await db.insert(users).values({
      id: "u2",
      email: "u2@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "customer",
      referralCode: "NORTH-U2",
    });
    await db.insert(checkoutSessions).values({
      id: "chk_x",
      userId: "u2",
      planId: "premium-monthly",
      providerSessionId: "cs_mock_other",
      status: "open",
    });
    expect((await complete(json({ sessionId: "cs_mock_other" }))).status).toBe(404);
  });

  it("rejects expired checkouts", async () => {
    const { body } = await start();
    await db
      .update(checkoutSessions)
      .set({ createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) })
      .where(eq(checkoutSessions.providerSessionId, body.sessionId!));
    const res = await complete(json({ sessionId: body.sessionId }));
    expect(res.status).toBe(400);
    expect(await db.select().from(subscriptions)).toHaveLength(0);
  });

  it("requires a verified email when mail delivery is real", async () => {
    ctx.verified = false;
    const { res } = await start();
    expect(res.status).toBe(403);
  });

  it("returns 400 (not 500) for malformed bodies", async () => {
    const bad = new Request("http://localhost/api", { method: "POST", body: "{not json" });
    expect((await checkout(bad)).status).toBe(400);
    expect((await complete(json({ nope: 1 }))).status).toBe(400);
  });
});
