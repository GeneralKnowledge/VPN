import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  auditEvents,
  createDb,
  devices,
  invoices,
  migrate,
  payments,
  plans,
  sessions,
  subscriptions,
  users,
  vpnAccounts,
} from "@northstar/db";
import { MockBillingProvider } from "@northstar/billing";
import { MockVPNProvider } from "@northstar/vpn-provider";
import { MockEmailProvider } from "@northstar/email";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  activateSubscription,
  assertDeviceCapacity,
  deleteUserAccount,
  expireLapsedSubscriptions,
  generateVpnPassword,
  handlePaymentFailed,
  handleRenewal,
  handleSubscriptionEnded,
  resetVpnCredentials,
  resumeSubscriptionForUser,
  retryDeletedAccountCleanup,
} from "./services";

const DAY = 24 * 60 * 60 * 1000;

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-billing-"));
  const databaseUrl = `file:${path.join(dir, "test.db")}`;
  process.env.NORTHSTAR_ROOT = dir;
  migrate(databaseUrl);
  return createDb(databaseUrl);
}

type TestDb = ReturnType<typeof createDb>["db"];

describe("billing lifecycle", () => {
  let db: TestDb;
  let vpn: MockVPNProvider;
  let email: MockEmailProvider;

  async function addUser(id: string, lifecycle: "customer" | "active" = "customer") {
    await db.insert(users).values({
      id,
      email: `${id}@test.local`,
      passwordHash: "x",
      role: "customer",
      lifecycle,
      referralCode: `NORTH-${id}`,
    });
  }

  async function subscribe(userId: string, subId = `ms_${userId}`) {
    return activateSubscription(db, vpn, email, {
      userId,
      planId: "premium-monthly",
      providerSubscriptionId: subId,
      provider: "mock",
      amount: 499,
      correlationId: "c",
    });
  }

  async function userRow(id: string) {
    return (await db.select().from(users).where(eq(users.id, id)))[0]!;
  }

  async function account(id: string) {
    return (await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, id)))[0]!;
  }

  async function setPeriodEnd(subId: string, end: Date) {
    await db.update(subscriptions).set({ currentPeriodEnd: end }).where(eq(subscriptions.id, subId));
  }

  beforeEach(async () => {
    ({ db } = tempDb());
    vpn = new MockVPNProvider();
    email = new MockEmailProvider();
    await db.insert(plans).values([
      {
        id: "premium-monthly",
        name: "Premium",
        description: "t",
        price: 499,
        currency: "GBP",
        billingInterval: "month",
        featuresJson: "[]",
        maxDevices: 2,
        active: true,
      },
    ]);
  });

  it("activation records both a payment and an invoice and reaches the active lifecycle", async () => {
    await addUser("u1");
    await subscribe("u1");
    expect(await db.select().from(payments)).toHaveLength(1);
    expect(await db.select().from(invoices)).toHaveLength(1);
    expect((await userRow("u1")).lifecycle).toBe("active");
  });

  it("a second payment never creates a second live subscription and is flagged for refund", async () => {
    await addUser("u1");
    const first = await subscribe("u1", "ms_one");
    const second = await subscribe("u1", "ms_two");
    expect(second.id).toBe(first.id);
    expect(await db.select().from(subscriptions)).toHaveLength(1);
    const audits = await db.select().from(auditEvents).where(eq(auditEvents.action, "billing.duplicate_payment"));
    expect(audits).toHaveLength(1);
    expect(await db.select().from(payments)).toHaveLength(2);
  });

  it("replaying the same provider subscription id is idempotent", async () => {
    await addUser("u1");
    await subscribe("u1", "ms_same");
    await subscribe("u1", "ms_same");
    expect(await db.select().from(subscriptions)).toHaveLength(1);
    expect(await db.select().from(payments)).toHaveLength(1);
  });

  it("the database refuses two live subscriptions for one user", async () => {
    await addUser("u1");
    const base = { userId: "u1", planId: "premium-monthly", provider: "mock" as const, status: "active" as const };
    await db.insert(subscriptions).values({ id: "s1", ...base });
    await expect(db.insert(subscriptions).values({ id: "s2", ...base })).rejects.toThrow();
    await db.insert(subscriptions).values({ id: "s3", ...base, status: "cancelled" });
  });

  describe("expiry", () => {
    it("ends a cancelling subscription at period end and cuts VPN access", async () => {
      await addUser("u1");
      const sub = await subscribe("u1");
      await db.update(subscriptions).set({ status: "cancelling", cancelAtPeriodEnd: true }).where(eq(subscriptions.id, sub.id));

      await setPeriodEnd(sub.id, new Date(Date.now() + DAY));
      expect(await expireLapsedSubscriptions(db, vpn, "c")).toEqual([]);

      await setPeriodEnd(sub.id, new Date(Date.now() - 1000));
      expect(await expireLapsedSubscriptions(db, vpn, "c")).toEqual(["u1"]);

      const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
      expect(row?.status).toBe("cancelled");
      expect((await account("u1")).status).toBe("disabled");
      expect((await userRow("u1")).lifecycle).toBe("cancelled");
    });

    it("keeps an unrenewed subscription during the grace window, then expires it", async () => {
      await addUser("u1");
      const sub = await subscribe("u1");

      await setPeriodEnd(sub.id, new Date(Date.now() - 1 * DAY));
      expect(await expireLapsedSubscriptions(db, vpn, "c")).toEqual([]);
      expect((await account("u1")).status).toBe("active");

      await setPeriodEnd(sub.id, new Date(Date.now() - 10 * DAY));
      expect(await expireLapsedSubscriptions(db, vpn, "c")).toEqual(["u1"]);
      const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
      expect(row?.status).toBe("expired");
      expect((await account("u1")).status).toBe("disabled");
    });
  });

  describe("dunning and renewal", () => {
    it("first failure starts a grace period, second suspends access", async () => {
      await addUser("u1");
      await subscribe("u1", "ms_1");
      await handlePaymentFailed(db, vpn, email, { providerSubscriptionId: "ms_1" }, "c");
      expect((await userRow("u1")).lifecycle).toBe("grace_period");
      expect((await account("u1")).status).toBe("active");
      const [pastDue] = await db.select().from(subscriptions);
      expect(pastDue?.status).toBe("past_due");

      await handlePaymentFailed(db, vpn, email, { providerSubscriptionId: "ms_1" }, "c");
      expect((await userRow("u1")).lifecycle).toBe("suspended");
      expect((await account("u1")).status).toBe("disabled");
      expect(email.getSent().some((m) => m.template === "payment_failed")).toBe(true);
    });

    it("a renewal extends the period once, is idempotent, and restores a suspended customer", async () => {
      await addUser("u1");
      const sub = await subscribe("u1", "ms_1");
      await handlePaymentFailed(db, vpn, email, { providerSubscriptionId: "ms_1" }, "c");
      await handlePaymentFailed(db, vpn, email, { providerSubscriptionId: "ms_1" }, "c");
      const before = (await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)))[0]!.currentPeriodEnd!;

      const renewal = { providerSubscriptionId: "ms_1", providerPaymentId: "in_1", amount: 499, provider: "mock" as const };
      await handleRenewal(db, vpn, renewal, "c");
      await handleRenewal(db, vpn, renewal, "c");

      const [after] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
      expect(after?.status).toBe("active");
      expect(after!.currentPeriodEnd!.getTime()).toBeGreaterThan(before.getTime());
      expect(await db.select().from(payments).where(eq(payments.providerPaymentId, "in_1"))).toHaveLength(1);
      expect((await userRow("u1")).lifecycle).toBe("active");
      expect((await account("u1")).status).toBe("active");
    });

    it("provider-ended subscriptions suspend access", async () => {
      await addUser("u1");
      await subscribe("u1", "ms_1");
      await handleSubscriptionEnded(db, vpn, { providerSubscriptionId: "ms_1" }, "c");
      const [row] = await db.select().from(subscriptions);
      expect(row?.status).toBe("cancelled");
      expect((await account("u1")).status).toBe("disabled");
    });
  });

  it("resubscribing after a cancellation turns the VPN back on", async () => {
    await addUser("u1");
    const sub = await subscribe("u1", "ms_1");
    await handleSubscriptionEnded(db, vpn, { providerSubscriptionId: "ms_1" }, "c");
    expect((await account("u1")).status).toBe("disabled");
    expect(sub.id).toBeTruthy();

    await subscribe("u1", "ms_2");
    expect((await account("u1")).status).toBe("active");
    expect((await userRow("u1")).lifecycle).toBe("active");
    const live = (await db.select().from(subscriptions)).filter((s) => s.status === "active");
    expect(live).toHaveLength(1);
  });

  it("resuming a cancelling subscription puts the customer back to a paying lifecycle", async () => {
    await addUser("u1");
    const billing = new MockBillingProvider("secret");
    const checkout = await billing.createCheckout({
      customerId: "u1",
      customerEmail: "u1@test.local",
      planId: "premium-monthly",
      successUrl: "http://x/s",
      cancelUrl: "http://x/c",
    });
    const providerSub = await billing.completeCheckout(checkout.id);
    await subscribe("u1", providerSub.id);
    await billing.cancelSubscription(providerSub.id, true);
    await db.update(subscriptions).set({ status: "cancelling", cancelAtPeriodEnd: true });
    await db.update(users).set({ lifecycle: "cancelled" }).where(eq(users.id, "u1"));

    const user = await userRow("u1");
    const resumed = await resumeSubscriptionForUser(db, billing, user, "c");
    expect(resumed?.status).toBe("active");
    expect((await userRow("u1")).lifecycle).toBe("active");
    expect((await db.select().from(subscriptions))[0]?.status).toBe("active");
  });

  describe("account deletion", () => {
    it("stops billing, removes the provider account, revokes sessions and anonymises the user", async () => {
      await addUser("u1");
      const billing = new MockBillingProvider("secret");
      const checkout = await billing.createCheckout({
        customerId: "u1",
        customerEmail: "u1@test.local",
        planId: "premium-monthly",
        successUrl: "http://x/s",
        cancelUrl: "http://x/c",
      });
      const providerSub = await billing.completeCheckout(checkout.id);
      await subscribe("u1", providerSub.id);
      await db.insert(sessions).values({ id: "sess1", userId: "u1", expiresAt: new Date(Date.now() + DAY) });
      await db.insert(devices).values({ id: "d1", userId: "u1", name: "Phone", platform: "ios" });

      await deleteUserAccount(db, vpn, billing, { id: "u1" }, "c");

      expect((await billing.getSubscription(providerSub.id)).status).toBe("cancelled");
      const [sub] = await db.select().from(subscriptions);
      expect(sub?.status).toBe("cancelled");
      expect((await account("u1")).status).toBe("expired");
      expect(await db.select().from(sessions)).toHaveLength(0);
      expect((await db.select().from(devices))[0]?.revokedAt).toBeTruthy();
      const user = await userRow("u1");
      expect(user.deletedAt).toBeTruthy();
      expect(user.email).toBe("deleted+u1@invalid.local");
      expect(user.passwordHash).toBe("!deleted");
      // Financial records are kept for accounting.
      expect(await db.select().from(payments)).toHaveLength(1);
    });

    it("keeps a retry marker when the provider is down and cleans up later", async () => {
      await addUser("u1");
      await subscribe("u1");
      const failing = Object.create(vpn) as MockVPNProvider;
      failing.deleteAccount = async () => {
        throw new Error("provider down");
      };
      await deleteUserAccount(db, failing, new MockBillingProvider("s"), { id: "u1" }, "c");
      expect((await account("u1")).status).toBe("error");
      expect((await userRow("u1")).deletedAt).toBeTruthy();

      expect(await retryDeletedAccountCleanup(db, vpn, "c")).toEqual(["u1"]);
      expect((await account("u1")).status).toBe("expired");
      expect(await retryDeletedAccountCleanup(db, vpn, "c")).toEqual([]);
    });

    it("aborts without touching the account if the billing provider cannot cancel", async () => {
      await addUser("u1");
      await subscribe("u1", "ms_x");
      const billing = new MockBillingProvider("s");
      billing.cancelSubscription = async () => {
        throw new Error("stripe unavailable");
      };
      await db.update(subscriptions).set({ providerSubscriptionId: "sub_real" });
      await expect(deleteUserAccount(db, vpn, billing, { id: "u1" }, "c")).rejects.toThrow("stripe unavailable");
      expect((await userRow("u1")).deletedAt).toBeNull();
      expect((await db.select().from(subscriptions))[0]?.status).toBe("active");
    });
  });

  it("enforces the plan device limit", async () => {
    await addUser("u1");
    await subscribe("u1");
    await db.insert(devices).values({ id: "d1", userId: "u1", name: "A", platform: "ios" });
    await assertDeviceCapacity(db, "u1");
    await db.insert(devices).values({ id: "d2", userId: "u1", name: "B", platform: "ios" });
    await expect(assertDeviceCapacity(db, "u1")).rejects.toThrow("Device limit reached (2)");
    await db.update(devices).set({ revokedAt: new Date() }).where(eq(devices.id, "d2"));
    await assertDeviceCapacity(db, "u1");
  });

  it("generates unique strong VPN passwords and can rotate credentials", async () => {
    expect(generateVpnPassword()).not.toBe(generateVpnPassword());
    expect(generateVpnPassword().length).toBeGreaterThanOrEqual(24);

    await addUser("u1");
    await expect(resetVpnCredentials(db, vpn, "u1", "c")).rejects.toThrow("not active");
    await subscribe("u1");
    const creds = await resetVpnCredentials(db, vpn, "u1", "c");
    expect(creds.username).toBe((await account("u1")).username);
    expect(creds.password.length).toBeGreaterThanOrEqual(24);
  });
});
