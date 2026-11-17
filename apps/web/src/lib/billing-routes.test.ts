import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  checkoutSessions,
  createDb,
  migrate,
  payments,
  plans,
  subscriptions,
  users,
  vpnAccounts,
  webhookEvents,
} from "@northstar/db";
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
  getEnv: () => ({ BILLING_PROVIDER: ctx.billingKind, CRYPTO_BILLING_PROVIDER: "mock" }),
  getBillingProvider: () => ctx.billing,
  getBillingProviderForPlan: () => ctx.billing,
  getCryptoBillingProvider: () => ctx.billing,
  allowsMockCheckoutComplete: () => ctx.billingKind === "mock",
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
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";
import { activateSubscription } from "@/lib/services";

function json(body: unknown) {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function start(planId = "platinum-monthly") {
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
      id: "platinum-monthly",
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
      username: "u1",
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
      username: "u2",
      email: "u2@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "customer",
      referralCode: "NORTH-U2",
    });
    await db.insert(checkoutSessions).values({
      id: "chk_x",
      userId: "u2",
      planId: "platinum-monthly",
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

  describe("stripe webhook", () => {
    function delivery(event: Record<string, unknown>) {
      return new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: { "content-type": "application/json", "x-northstar-signature": "secret" },
        body: JSON.stringify(event),
      });
    }

    async function subscribed() {
      await activateSubscription(db, ctx.vpn as MockVPNProvider, ctx.email as MockEmailProvider, {
        userId: "u1",
        planId: "platinum-monthly",
        providerSubscriptionId: "ms_1",
        provider: "mock",
        amount: 499,
        correlationId: "c",
      });
      return (await db.select().from(subscriptions))[0]!;
    }

    const renewal = (eventId: string, invoiceId = "in_1") => ({
      id: eventId,
      type: "mock.invoice.paid",
      subscriptionId: "ms_1",
      paymentId: invoiceId,
      amount: 499,
    });

    it("rejects an unsigned delivery", async () => {
      const res = await stripeWebhook(
        new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: JSON.stringify(renewal("evt_x")) }),
      );
      expect(res.status).toBe(401);
    });

    it("concurrent deliveries of one event extend the period once", async () => {
      const before = await subscribed();
      const results = await Promise.all([
        stripeWebhook(delivery(renewal("evt_1"))),
        stripeWebhook(delivery(renewal("evt_1"))),
        stripeWebhook(delivery(renewal("evt_1"))),
      ]);
      expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
      const after = (await db.select().from(subscriptions))[0]!;
      expect(after.currentPeriodEnd!.getMonth()).toBe((before.currentPeriodEnd!.getMonth() + 1) % 12);
      expect(await db.select().from(payments).where(eq(payments.providerPaymentId, "in_1"))).toHaveLength(1);
    });

    it("two different events for the same invoice record one payment and one extension", async () => {
      const before = await subscribed();
      await Promise.all([
        stripeWebhook(delivery(renewal("evt_a", "in_9"))),
        stripeWebhook(delivery(renewal("evt_b", "in_9"))),
      ]);
      const after = (await db.select().from(subscriptions))[0]!;
      expect(after.currentPeriodEnd!.getMonth()).toBe((before.currentPeriodEnd!.getMonth() + 1) % 12);
      expect(await db.select().from(payments).where(eq(payments.providerPaymentId, "in_9"))).toHaveLength(1);
    });

    it("refuses a delivery while another holds the claim, and retries a stale claim", async () => {
      await subscribed();
      await db.insert(webhookEvents).values({
        id: "wh_1",
        provider: "stripe",
        eventId: "evt_busy",
        eventType: "mock.invoice.paid",
        payloadJson: "{}",
        signatureValid: true,
        processingError: "processing",
      });
      expect((await stripeWebhook(delivery(renewal("evt_busy")))).status).toBe(409);

      await db
        .update(webhookEvents)
        .set({ updatedAt: new Date(Date.now() - 10 * 60_000) })
        .where(eq(webhookEvents.id, "wh_1"));
      expect((await stripeWebhook(delivery(renewal("evt_busy")))).status).toBe(200);
      const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, "wh_1"));
      expect(row?.processedAt).toBeTruthy();
      expect((await stripeWebhook(delivery(renewal("evt_busy")))).status).toBe(200);
    });
  });
});
