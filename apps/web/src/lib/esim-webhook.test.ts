import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { MockOneTimePayments, StripeBillingProvider, signStripePayload } from "@northstar/billing";
import { createDb, esimOrders, migrate, subscriptions, users } from "@northstar/db";
import { MockEsimProvider } from "@northstar/esim-provider";
import { MockEmailProvider } from "@northstar/email";
import { MockVPNProvider } from "@northstar/vpn-provider";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SECRET = "whsec_esim_test";

const ctx = vi.hoisted(() => ({
  db: null as unknown,
  billing: null as unknown,
  pay: null as unknown,
  esim: null as unknown,
}));

vi.mock("@/lib/providers", () => ({
  getDb: () => ctx.db,
  getEnv: () => ({ BILLING_PROVIDER: "stripe", CRYPTO_BILLING_PROVIDER: "mock" }),
  getBillingProvider: () => ctx.billing,
  getOneTimePayments: () => ctx.pay,
  getEsimProvider: () => ctx.esim,
  getVpnProvider: () => new MockVPNProvider(),
  getEmailProvider: () => new MockEmailProvider(),
  appUrl: () => "http://localhost:3000",
  track: () => undefined,
}));

import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";

type TestDb = ReturnType<typeof createDb>["db"];

describe("Stripe webhook for one-time eSIM payments", () => {
  let db: TestDb;

  beforeEach(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-esim-wh-"));
    const url = `file:${path.join(dir, "t.db")}`;
    process.env.NORTHSTAR_ROOT = dir;
    migrate(url);
    db = createDb(url).db;
    ctx.db = db;
    ctx.billing = new StripeBillingProvider({ secretKey: "sk_test_x", webhookSecret: SECRET, priceMap: {} });
    ctx.pay = new MockOneTimePayments();
    ctx.esim = new MockEsimProvider();
    await db.insert(users).values({
      id: "u1",
      username: "u1",
      email: "u1@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "customer",
      referralCode: "REF-U1",
    });
    await db.insert(esimOrders).values({
      id: "eso_1",
      userId: "u1",
      packageCode: "MOCK-GB-1GB-7D",
      packageName: "UK 1GB",
      countryCode: "GB",
      amount: 499,
      currency: "GBP",
      status: "pending",
      billingProvider: "stripe",
      providerCheckoutId: "cs_test_1",
      esimProvider: "mock",
      idempotencyKey: "k1",
    });
  });

  function completed(id: string, overrides?: Record<string, unknown>) {
    return {
      id,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_1",
          object: "checkout.session",
          mode: "payment",
          status: "complete",
          payment_status: "paid",
          payment_intent: "pi_1",
          amount_total: 499,
          currency: "gbp",
          metadata: { kind: "esim", orderId: "eso_1" },
          ...overrides,
        },
      },
    };
  }

  function delivery(event: unknown, secret = SECRET) {
    const body = JSON.stringify(event);
    return new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body,
      headers: { "stripe-signature": signStripePayload(body, secret) },
    });
  }

  async function order() {
    return (await db.select().from(esimOrders).where(eq(esimOrders.id, "eso_1")))[0]!;
  }

  it("rejects an unsigned or wrongly signed delivery", async () => {
    expect((await stripeWebhook(delivery(completed("evt_bad"), "whsec_wrong"))).status).toBe(401);
    expect((await order()).status).toBe("pending");
  });

  it("issues the eSIM on a signed completion and never touches subscriptions", async () => {
    const res = await stripeWebhook(delivery(completed("evt_1")));
    expect(res.status).toBe(200);
    expect((await order()).status).toBe("issued");
    expect((await order()).providerPaymentId).toBe("pi_1");
    expect(await db.select().from(subscriptions)).toHaveLength(0);
    // A replay of the same event is deduplicated.
    expect(await (await stripeWebhook(delivery(completed("evt_1")))).json()).toMatchObject({ deduped: true });
  });

  it("expires the order when the session expires unpaid", async () => {
    const event = { ...completed("evt_exp", { status: "expired", payment_status: "unpaid" }), type: "checkout.session.expired" };
    expect((await stripeWebhook(delivery(event))).status).toBe(200);
    expect((await order()).status).toBe("expired");
  });

  it("marks the order refunded on charge.refunded", async () => {
    await stripeWebhook(delivery(completed("evt_1")));
    const refund = {
      id: "evt_ref",
      type: "charge.refunded",
      data: { object: { id: "ch_1", object: "charge", payment_intent: "pi_1", refunded: true } },
    };
    expect((await stripeWebhook(delivery(refund))).status).toBe(200);
    expect((await order()).status).toBe("refunded");
  });
});
