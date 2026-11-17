import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { MockOneTimePayments, StripeBillingProvider, signStripePayload } from "@northstar/billing";
import { auditEvents, checkoutSessions, createDb, migrate, payments, plans, subscriptions, users, vpnAccounts } from "@northstar/db";
import { MockEmailProvider } from "@northstar/email";
import { MockVPNProvider } from "@northstar/vpn-provider";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SECRET = "whsec_vpn_test";

const ctx = vi.hoisted(() => ({
  db: null as unknown,
  billing: null as unknown,
  pay: null as unknown,
  vpn: null as unknown,
  stripeCalls: [] as Array<{ method: string; url: string }>,
}));

vi.mock("@/lib/providers", () => ({
  getDb: () => ctx.db,
  getEnv: () => ({ BILLING_PROVIDER: "stripe", CRYPTO_BILLING_PROVIDER: "mock" }),
  getBillingProvider: () => ctx.billing,
  getOneTimePayments: () => ctx.pay,
  getEsimProvider: () => null,
  getVpnProvider: () => ctx.vpn,
  getEmailProvider: () => new MockEmailProvider(),
  appUrl: () => "http://localhost:3000",
  track: () => undefined,
}));

import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";

type TestDb = ReturnType<typeof createDb>["db"];

/** Stripe API stand-in: records calls and answers subscription and invoice lookups. */
const fakeStripe = (async (url: string, init: RequestInit) => {
  ctx.stripeCalls.push({ method: String(init.method), url });
  if (url.includes("/invoices/")) {
    return new Response(JSON.stringify({ id: "in_x", payment_intent: "pi_dup" }), { status: 200 });
  }
  const id = url.split("/subscriptions/")[1] ?? "sub_x";
  return new Response(JSON.stringify({ id, status: "canceled", cancel_at_period_end: false }), { status: 200 });
}) as unknown as typeof fetch;

describe("Stripe webhook for VPN subscriptions", () => {
  let db: TestDb;

  beforeEach(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-vpn-wh-"));
    const url = `file:${path.join(dir, "t.db")}`;
    process.env.NORTHSTAR_ROOT = dir;
    migrate(url);
    db = createDb(url).db;
    ctx.db = db;
    ctx.stripeCalls = [];
    ctx.billing = new StripeBillingProvider({
      secretKey: "sk_test_x",
      webhookSecret: SECRET,
      priceMap: { "platinum-monthly": "price_m" },
      fetchFn: fakeStripe,
    });
    ctx.pay = new MockOneTimePayments();
    ctx.vpn = new MockVPNProvider();
    await db.insert(plans).values({
      id: "platinum-monthly",
      name: "Platinum",
      description: "t",
      price: 499,
      currency: "GBP",
      billingInterval: "month",
      featuresJson: "[]",
      maxDevices: 2,
      active: true,
    });
    await db.insert(users).values({
      id: "u1",
      username: "u1",
      email: "u1@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "customer",
      referralCode: "REF-U1",
    });
    for (const n of [1, 2]) {
      await db.insert(checkoutSessions).values({
        id: `chk_${n}`,
        userId: "u1",
        planId: "platinum-monthly",
        providerSessionId: `cs_test_${n}`,
        status: "open",
        idempotencyKey: `k${n}`,
      });
    }
  });

  function session(n: number, overrides?: Record<string, unknown>) {
    return {
      id: `cs_test_${n}`,
      object: "checkout.session",
      mode: "subscription",
      status: "complete",
      payment_status: "paid",
      subscription: `sub_${n}`,
      invoice: `in_${n}`,
      amount_total: 499,
      currency: "gbp",
      metadata: { kind: "vpn", userId: "u1", planId: "platinum-monthly" },
      ...overrides,
    };
  }

  function event(id: string, type: string, object: unknown) {
    return { id, type, data: { object } };
  }

  function delivery(evt: unknown, secret = SECRET) {
    const body = JSON.stringify(evt);
    return new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body,
      headers: { "stripe-signature": signStripePayload(body, secret) },
    });
  }

  async function subs() {
    return db.select().from(subscriptions).where(eq(subscriptions.userId, "u1"));
  }

  async function audit(action: string) {
    return db.select().from(auditEvents).where(eq(auditEvents.action, action));
  }

  it("rejects a forged completion", async () => {
    const res = await stripeWebhook(delivery(event("evt_bad", "checkout.session.completed", session(1)), "whsec_wrong"));
    expect(res.status).toBe(401);
    expect(await subs()).toHaveLength(0);
  });

  it("activates and provisions only after a paid, matching session; replays are deduplicated", async () => {
    const res = await stripeWebhook(delivery(event("evt_1", "checkout.session.completed", session(1))));
    expect(res.status).toBe(200);
    const [sub] = await subs();
    expect(sub).toMatchObject({ status: "active", provider: "stripe", providerSubscriptionId: "sub_1" });
    const [pay] = await db.select().from(payments);
    expect(pay).toMatchObject({ providerPaymentId: "in_1", amount: 499, status: "succeeded" });
    expect((await db.select().from(vpnAccounts))[0]?.status).toBe("active");
    const [chk] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, "chk_1"));
    expect(chk?.status).toBe("complete");

    const replay = await stripeWebhook(delivery(event("evt_1", "checkout.session.completed", session(1))));
    expect(await replay.json()).toMatchObject({ deduped: true });
    // The first invoice is the checkout's own payment, so it does not count as a renewal.
    await stripeWebhook(
      delivery(event("evt_inv", "invoice.paid", { id: "in_1", subscription: "sub_1", billing_reason: "subscription_create", amount_paid: 499 })),
    );
    expect(await db.select().from(payments)).toHaveLength(1);
  });

  it("waits for the money when the session completes unpaid", async () => {
    await stripeWebhook(delivery(event("evt_1", "checkout.session.completed", session(1, { payment_status: "unpaid" }))));
    expect(await subs()).toHaveLength(0);
    await stripeWebhook(delivery(event("evt_2", "checkout.session.async_payment_succeeded", session(1))));
    expect((await subs())[0]?.status).toBe("active");
  });

  it("grants nothing for a session this site did not start or that names another user", async () => {
    await stripeWebhook(delivery(event("evt_1", "checkout.session.completed", session(9))));
    await stripeWebhook(
      delivery(event("evt_2", "checkout.session.completed", session(1, { metadata: { kind: "vpn", userId: "u2", planId: "platinum-monthly" } }))),
    );
    expect(await subs()).toHaveLength(0);
    expect(await audit("billing.checkout_unknown")).toHaveLength(1);
    expect(await audit("billing.checkout_mismatch")).toHaveLength(1);
  });

  it("cancels and refunds a second paid checkout, keeping the first plan", async () => {
    await stripeWebhook(delivery(event("evt_1", "checkout.session.completed", session(1))));
    const res = await stripeWebhook(delivery(event("evt_2", "checkout.session.completed", session(2))));
    expect(res.status).toBe(200);
    const live = (await subs()).filter((s) => s.status === "active");
    expect(live).toHaveLength(1);
    expect(live[0]?.providerSubscriptionId).toBe("sub_1");
    expect(ctx.stripeCalls).toContainEqual({ method: "DELETE", url: "https://api.stripe.com/v1/subscriptions/sub_2" });
    expect((ctx.pay as MockOneTimePayments).refunds).toEqual([
      { paymentIntentId: "pi_dup", idempotencyKey: "vpn_dup_refund_cs_test_2" },
    ]);
    const [dup] = await db.select().from(payments).where(eq(payments.providerPaymentId, "in_2"));
    expect(dup?.status).toBe("refunded");

    // Stripe then reports the refund; the live plan is untouched.
    await stripeWebhook(
      delivery(event("evt_ref", "charge.refunded", { id: "ch_2", payment_intent: "pi_dup", invoice: "in_2", refunded: true })),
    );
    expect((await subs()).find((s) => s.providerSubscriptionId === "sub_1")?.status).toBe("active");
  });

  it("ends access on a full refund of the plan's payment", async () => {
    await stripeWebhook(delivery(event("evt_1", "checkout.session.completed", session(1))));
    await stripeWebhook(
      delivery(event("evt_ref", "charge.refunded", { id: "ch_1", payment_intent: "pi_1", invoice: "in_1", refunded: true })),
    );
    expect((await subs())[0]?.status).toBe("cancelled");
    expect(ctx.stripeCalls).toContainEqual({ method: "DELETE", url: "https://api.stripe.com/v1/subscriptions/sub_1" });
    expect((await db.select().from(vpnAccounts))[0]?.status).not.toBe("active");
  });

  it("follows a cancel and resume made in the Stripe dashboard", async () => {
    await stripeWebhook(delivery(event("evt_1", "checkout.session.completed", session(1))));
    const sub = { id: "sub_1", object: "subscription", status: "active", current_period_end: 1_900_000_000, metadata: { kind: "vpn" } };
    await stripeWebhook(delivery(event("evt_u1", "customer.subscription.updated", { ...sub, cancel_at_period_end: true })));
    expect((await subs())[0]).toMatchObject({ status: "cancelling", cancelAtPeriodEnd: true });
    await stripeWebhook(delivery(event("evt_u2", "customer.subscription.updated", { ...sub, cancel_at_period_end: false })));
    expect((await subs())[0]).toMatchObject({ status: "active", cancelAtPeriodEnd: false });
  });

  it("records renewals keyed by invoice, including the newer invoice shape", async () => {
    await stripeWebhook(delivery(event("evt_1", "checkout.session.completed", session(1))));
    const before = (await subs())[0]!.currentPeriodEnd!.getTime();
    await stripeWebhook(
      delivery(
        event("evt_r", "invoice.paid", {
          id: "in_r2",
          billing_reason: "subscription_cycle",
          amount_paid: 499,
          parent: { subscription_details: { subscription: "sub_1" } },
        }),
      ),
    );
    expect((await subs())[0]!.currentPeriodEnd!.getTime()).toBeGreaterThan(before);
    expect(await db.select().from(payments)).toHaveLength(2);
  });

  it("expires an abandoned checkout", async () => {
    await stripeWebhook(delivery(event("evt_x", "checkout.session.expired", session(1, { status: "expired", payment_status: "unpaid" }))));
    const [chk] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, "chk_1"));
    expect(chk?.status).toBe("expired");
  });
});
