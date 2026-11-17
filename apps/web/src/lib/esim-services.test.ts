import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { BillingProviderError, type CheckoutSessionState, type OneTimePayments } from "@northstar/billing";
import { createDb, esimOrders, migrate, payments, users, type Db } from "@northstar/db";
import { createEsimProvider, EsimProviderError, type EsimProvider } from "@northstar/esim-provider";
import { createEmailProvider } from "@northstar/email";
import {
  MAX_ESIM_ISSUE_ATTEMPTS,
  PENDING_CHECK_AFTER_MS,
  STALE_ISSUING_MS,
  completeEsimOrder,
  confirmEsimPayment,
  createEsimCheckoutOrder,
  listUserEsimOrders,
  reconcileEsimOrders,
  recordEsimRefundFromStripe,
} from "./esim-services";
import { newId } from "./utils";

describe("esim checkout → issue", () => {
  let db: Db;
  let close: (() => void) | undefined;

  afterEach(() => {
    close?.();
  });

  async function setup() {
    const dir = mkdtempSync(path.join(tmpdir(), "northstar-esim-"));
    const url = `file:${path.join(dir, "t.db")}`;
    process.env.NORTHSTAR_ROOT = dir;
    migrate(url);
    const client = createDb(url);
    db = client.db;
    close = client.close;
    const userId = newId("usr");
    await db.insert(users).values({
      id: userId,
      username: `sim_${userId.slice(-8)}`,
      email: "esim@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "customer",
      referralCode: `SIM-${userId.slice(-6)}`,
    });
    return userId;
  }

  it("creates a pending order and issues after mock payment", async () => {
    const userId = await setup();
    const esim = createEsimProvider("mock");
    const email = createEmailProvider("mock");
    const packages = await esim.listPackages({ country: "GB" });
    const pkg = packages[0]!;

    const created = await createEsimCheckoutOrder(db, esim, {
      userId,
      packageCode: pkg.code,
      billingProvider: "mock",
      esimProviderKind: "mock",
      correlationId: "c1",
    });
    expect(created.checkoutId).toBeTruthy();

    const result = await completeEsimOrder(db, esim, email, {
      checkoutId: created.checkoutId,
      userId,
      correlationId: "c1",
    });
    expect(result.order.status).toBe("issued");

    const listed = await listUserEsimOrders(db, userId);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.profile?.qrCodeUrl).toMatch(/^data:image\/png;base64,/);
    expect(listed[0]!.profile?.iccid).toBeTruthy();
  });

  it("only issues once under concurrent complete calls", async () => {
    const userId = await setup();
    let createCalls = 0;
    const base = createEsimProvider("mock");
    const esim: EsimProvider = {
      getProviderStatus: () => base.getProviderStatus(),
      listPackages: (filter) => base.listPackages(filter),
      getPackage: (code) => base.getPackage(code),
      getOrder: (id) => base.getOrder(id),
      createOrder: async (input) => {
        createCalls += 1;
        return base.createOrder(input);
      },
    };
    const email = createEmailProvider("mock");
    const packages = await esim.listPackages({ country: "GB" });
    const created = await createEsimCheckoutOrder(db, esim, {
      userId,
      packageCode: packages[0]!.code,
      billingProvider: "mock",
      esimProviderKind: "mock",
      correlationId: "c2",
    });

    await Promise.all([
      completeEsimOrder(db, esim, email, {
        checkoutId: created.checkoutId,
        userId,
        correlationId: "c2a",
      }),
      completeEsimOrder(db, esim, email, {
        checkoutId: created.checkoutId,
        userId,
        correlationId: "c2b",
      }),
    ]);

    expect(createCalls).toBe(1);
    const listed = await listUserEsimOrders(db, userId);
    expect(listed.filter((r) => r.profile).length).toBe(1);
    expect(listed[0]!.order.status).toBe("issued");
  });
});

describe("esim Stripe payments, failures and refunds", () => {
  let db: Db;
  let close: (() => void) | undefined;

  afterEach(() => {
    close?.();
  });

  async function setup() {
    const dir = mkdtempSync(path.join(tmpdir(), "northstar-esim-pay-"));
    const url = `file:${path.join(dir, "t.db")}`;
    process.env.NORTHSTAR_ROOT = dir;
    migrate(url);
    const client = createDb(url);
    db = client.db;
    close = client.close;
    const userId = newId("usr");
    await db.insert(users).values({
      id: userId,
      username: `pay_${userId.slice(-8)}`,
      email: "pay@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "customer",
      referralCode: `PAY-${userId.slice(-6)}`,
    });
    return userId;
  }

  /** Fake Stripe: records sessions and refunds; reconciliation reads `sessions`. */
  function fakePayments() {
    const sessions = new Map<string, CheckoutSessionState>();
    const refunds: string[] = [];
    let n = 0;
    const pay: OneTimePayments = {
      provider: "stripe",
      createOneTimeCheckout: async (input) => {
        n += 1;
        const id = `cs_test_${n}`;
        sessions.set(id, {
          id,
          status: "open",
          paymentStatus: "unpaid",
          paymentIntentId: null,
          amountTotal: input.amount,
          currency: input.currency.toLowerCase(),
          orderId: input.orderId,
        });
        return { id, url: `https://checkout.stripe.test/${id}` };
      },
      getCheckoutSession: async (id) => sessions.get(id) ?? null,
      refund: async (pi, key) => {
        if (!refunds.includes(key)) refunds.push(key);
        return { id: `re_${pi}`, status: "succeeded" };
      },
    };
    return { pay, sessions, refunds };
  }

  /** Mock eSIM provider whose createOrder can be scripted to fail. */
  function scriptedEsim(failWith?: () => Error) {
    const base = createEsimProvider("mock");
    const state = { calls: 0, failWith };
    const esim: EsimProvider = {
      getProviderStatus: () => base.getProviderStatus(),
      listPackages: (f) => base.listPackages(f),
      getPackage: (c) => base.getPackage(c),
      getOrder: (id) => base.getOrder(id),
      createOrder: async (input) => {
        state.calls += 1;
        if (state.failWith) throw state.failWith();
        return base.createOrder(input);
      },
    };
    return { esim, state };
  }

  async function startCheckout(userId: string, esim: EsimProvider, pay: OneTimePayments) {
    const pkg = (await esim.listPackages({ country: "GB" }))[0]!;
    return createEsimCheckoutOrder(db, esim, {
      userId,
      packageCode: pkg.code,
      billingProvider: "stripe",
      esimProviderKind: "mock",
      correlationId: "c",
      payments: pay,
      successUrl: "https://sim.test/ok",
      cancelUrl: "https://sim.test/no",
    });
  }

  function paid(checkoutSessionId: string, amount: number, extra?: Partial<{ currency: string; pi: string }>) {
    return {
      checkoutSessionId,
      paymentStatus: "paid",
      paymentIntentId: extra?.pi ?? `pi_${checkoutSessionId}`,
      amountTotal: amount,
      currency: extra?.currency ?? "gbp",
      correlationId: "c",
    };
  }

  async function orderOf(id: string) {
    return (await db.select().from(esimOrders).where(eq(esimOrders.id, id)))[0]!;
  }

  it("issues once after a confirmed payment, even when the webhook repeats", async () => {
    const userId = await setup();
    const { pay } = fakePayments();
    const { esim, state } = scriptedEsim();
    const email = createEmailProvider("mock");
    const created = await startCheckout(userId, esim, pay);
    expect(created.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect((await orderOf(created.orderId)).status).toBe("pending");

    await Promise.all([
      confirmEsimPayment(db, esim, email, pay, paid(created.checkoutId, created.amount)),
      confirmEsimPayment(db, esim, email, pay, paid(created.checkoutId, created.amount)),
    ]);
    await confirmEsimPayment(db, esim, email, pay, paid(created.checkoutId, created.amount));

    expect(state.calls).toBe(1);
    expect((await orderOf(created.orderId)).status).toBe("issued");
    const recorded = await db.select().from(payments);
    expect(recorded).toHaveLength(1);
    // eSIM money is booked separately from VPN money.
    expect(recorded[0]!.product).toBe("esim");
  });

  it("does nothing for an unpaid session and holds a wrong amount for review", async () => {
    const userId = await setup();
    const { pay } = fakePayments();
    const { esim, state } = scriptedEsim();
    const email = createEmailProvider("mock");
    const created = await startCheckout(userId, esim, pay);

    await confirmEsimPayment(db, esim, email, pay, { ...paid(created.checkoutId, created.amount), paymentStatus: "unpaid" });
    expect((await orderOf(created.orderId)).status).toBe("pending");

    await confirmEsimPayment(db, esim, email, pay, paid(created.checkoutId, created.amount - 1));
    const order = await orderOf(created.orderId);
    expect(order.status).toBe("needs_review");
    expect(order.lastError).toMatch(/expected/);
    expect(state.calls).toBe(0);
  });

  it("never retries an issue that may have reached the provider", async () => {
    const userId = await setup();
    const { pay, refunds } = fakePayments();
    const { esim, state } = scriptedEsim(() => new EsimProviderError("Request timed out", "timeout", true));
    const email = createEmailProvider("mock");
    const created = await startCheckout(userId, esim, pay);

    await confirmEsimPayment(db, esim, email, pay, paid(created.checkoutId, created.amount));
    expect((await orderOf(created.orderId)).status).toBe("needs_review");

    await reconcileEsimOrders(db, esim, email, "r", { payments: pay });
    expect(state.calls).toBe(1);
    expect(refunds).toHaveLength(0);
  });

  it("refunds at once when the provider rejects the order", async () => {
    const userId = await setup();
    const { pay, refunds } = fakePayments();
    const { esim } = scriptedEsim(() => new EsimProviderError("Unknown package", "validation"));
    const email = createEmailProvider("mock");
    const created = await startCheckout(userId, esim, pay);

    await confirmEsimPayment(db, esim, email, pay, paid(created.checkoutId, created.amount));
    expect((await orderOf(created.orderId)).status).toBe("refunded");
    expect(refunds).toEqual([`refund_${created.orderId}`]);
    expect((await db.select().from(payments))[0]!.status).toBe("refunded");
  });

  it("retries a refused order (empty wallet) and refunds after the attempt limit", async () => {
    const userId = await setup();
    const { pay, refunds } = fakePayments();
    const { esim, state } = scriptedEsim(() => new EsimProviderError("Low balance", "insufficient_balance", true));
    const email = createEmailProvider("mock");
    const created = await startCheckout(userId, esim, pay);

    await confirmEsimPayment(db, esim, email, pay, paid(created.checkoutId, created.amount));
    expect((await orderOf(created.orderId)).status).toBe("failed");

    for (let i = 0; i < MAX_ESIM_ISSUE_ATTEMPTS; i += 1) {
      await reconcileEsimOrders(db, esim, email, "r", { payments: pay });
    }
    expect(state.calls).toBe(MAX_ESIM_ISSUE_ATTEMPTS);
    expect((await orderOf(created.orderId)).status).toBe("refunded");
    expect(refunds).toHaveLength(1);
  });

  it("recovers when the wallet is topped up before the limit", async () => {
    const userId = await setup();
    const { pay } = fakePayments();
    const { esim, state } = scriptedEsim(() => new EsimProviderError("Low balance", "insufficient_balance", true));
    const email = createEmailProvider("mock");
    const created = await startCheckout(userId, esim, pay);
    await confirmEsimPayment(db, esim, email, pay, paid(created.checkoutId, created.amount));

    state.failWith = undefined;
    await reconcileEsimOrders(db, esim, email, "r", { payments: pay });
    expect((await orderOf(created.orderId)).status).toBe("issued");
  });

  it("hands a stale issuing order to a person instead of retrying it", async () => {
    const userId = await setup();
    const { pay } = fakePayments();
    const { esim, state } = scriptedEsim();
    const email = createEmailProvider("mock");
    const created = await startCheckout(userId, esim, pay);
    await db
      .update(esimOrders)
      .set({ status: "issuing", updatedAt: new Date(Date.now() - STALE_ISSUING_MS - 1000) })
      .where(eq(esimOrders.id, created.orderId));

    await reconcileEsimOrders(db, esim, email, "r", { payments: pay });
    expect((await orderOf(created.orderId)).status).toBe("needs_review");
    expect(state.calls).toBe(0);
  });

  it("confirms a payment whose webhook never arrived, and expires abandoned checkouts", async () => {
    const userId = await setup();
    const { pay, sessions } = fakePayments();
    const { esim } = scriptedEsim();
    const email = createEmailProvider("mock");
    const a = await startCheckout(userId, esim, pay);
    const b = await startCheckout(userId, esim, pay);
    sessions.set(a.checkoutId, { ...sessions.get(a.checkoutId)!, status: "complete", paymentStatus: "paid", paymentIntentId: "pi_a" });
    sessions.set(b.checkoutId, { ...sessions.get(b.checkoutId)!, status: "expired" });

    // Too fresh: left alone.
    await reconcileEsimOrders(db, esim, email, "r", { payments: pay });
    expect((await orderOf(a.orderId)).status).toBe("pending");

    const later = new Date(Date.now() + PENDING_CHECK_AFTER_MS + 1000);
    await reconcileEsimOrders(db, esim, email, "r", { payments: pay, now: later });
    expect((await orderOf(a.orderId)).status).toBe("issued");
    expect((await orderOf(b.orderId)).status).toBe("expired");
  });

  it("records refunds made in the Stripe dashboard", async () => {
    const userId = await setup();
    const { pay } = fakePayments();
    const { esim } = scriptedEsim();
    const email = createEmailProvider("mock");
    const created = await startCheckout(userId, esim, pay);
    await confirmEsimPayment(db, esim, email, pay, paid(created.checkoutId, created.amount, { pi: "pi_dash" }));

    expect(await recordEsimRefundFromStripe(db, "pi_dash", "c")).toBe(created.orderId);
    expect((await orderOf(created.orderId)).status).toBe("refunded");
    expect(await recordEsimRefundFromStripe(db, "pi_other", "c")).toBeNull();
  });

  it("closes the order when Stripe refuses to start checkout", async () => {
    const userId = await setup();
    const { esim } = scriptedEsim();
    const pay: OneTimePayments = {
      ...fakePayments().pay,
      createOneTimeCheckout: async () => {
        throw new BillingProviderError("Live Stripe keys are refused", "unauthorized");
      },
    };
    await expect(startCheckout(userId, esim, pay)).rejects.toMatchObject({ status: 503 });
    const [order] = await db.select().from(esimOrders);
    expect(order!.status).toBe("expired");
  });
});
