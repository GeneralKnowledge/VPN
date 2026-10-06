import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createDb,
  migrate,
  plans,
  subscriptions,
  users,
  vpnAccounts,
  vpnConnections,
  vpnLocations,
} from "@northstar/db";
import { MockVPNProvider, VpnProviderError } from "@northstar/vpn-provider";
import { MockEmailProvider } from "@northstar/email";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  activateSubscription,
  provisionVpnForUser,
  reconcileVpnProvisioning,
  suspendVpnForUser,
  syncLocationsFromProvider,
} from "./services";

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-test-"));
  const databaseUrl = `file:${path.join(dir, "test.db")}`;
  process.env.NORTHSTAR_ROOT = dir;
  migrate(databaseUrl);
  return createDb(databaseUrl);
}

async function seedPlan(db: ReturnType<typeof createDb>["db"]) {
  await db.insert(plans).values({
    id: "premium-monthly",
    name: "Premium",
    description: "test",
    price: 499,
    currency: "GBP",
    billingInterval: "month",
    featuresJson: "[]",
    maxDevices: 5,
    active: true,
  });
}

describe("VPN lifecycle services", () => {
  let db: ReturnType<typeof createDb>["db"];
  let close: () => void | Promise<void>;
  let vpn: MockVPNProvider;
  let email: MockEmailProvider;

  beforeEach(async () => {
    const t = tempDb();
    db = t.db;
    close = t.close;
    vpn = new MockVPNProvider();
    email = new MockEmailProvider();
    await seedPlan(db);
  });

  it("subscription → provision → location → connection → config", async () => {
    await db.insert(users).values({
      id: "user_a",
      email: "a@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "customer",
      referralCode: "NORTH-A",
    });

    await activateSubscription(db, vpn, email, {
      userId: "user_a",
      planId: "premium-monthly",
      providerSubscriptionId: "mock_sub_1",
      provider: "mock",
      amount: 499,
      correlationId: "c1",
    });

    const [account] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, "user_a"));
    expect(account?.status).toBe("active");
    expect(account?.providerAccountId.startsWith("pending_")).toBe(false);

    await syncLocationsFromProvider(db, vpn, false);
    const locs = await db.select().from(vpnLocations);
    expect(locs.length).toBeGreaterThan(0);

    await db.insert(vpnConnections).values({
      id: "conn_1",
      userId: "user_a",
      vpnAccountId: account!.id,
      locationId: locs[0]!.id,
      name: "Laptop",
      protocol: "wireguard",
    });

    const config = await vpn.getConnectionConfig({
      accountId: account!.providerAccountId,
      locationId: locs[0]!.providerId,
      protocol: "wireguard",
    });
    expect(config.content).toContain("MOCK CONFIGURATION");
    await close();
  });

  it("is idempotent when provider account exists but local is error/pending", async () => {
    await db.insert(users).values({
      id: "user_b",
      email: "b@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "subscribed",
      referralCode: "NORTH-B",
    });
    await db.insert(subscriptions).values({
      id: "sub_b",
      userId: "user_b",
      planId: "premium-monthly",
      status: "active",
      provider: "mock",
      providerSubscriptionId: "ms_b",
    });

    await provisionVpnForUser(db, vpn, email, "user_b", "c2");
    const [first] = await db.select().from(vpnAccounts);
    const providerId = first!.providerAccountId;
    const username = first!.username;

    await db
      .update(vpnAccounts)
      .set({
        status: "error",
        lastError: '{"code":"timeout"}',
        providerAccountId: "pending_user_b",
        username,
      })
      .where(eq(vpnAccounts.id, first!.id));

    await provisionVpnForUser(db, vpn, email, "user_b", "c3");
    const [second] = await db.select().from(vpnAccounts);
    expect(second!.providerAccountId).toBe(providerId);
    expect(second!.status).toBe("active");
    await close();
  });

  it("reconcile repairs pending local vs active provider", async () => {
    await db.insert(users).values({
      id: "user_c",
      email: "c@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "subscribed",
      referralCode: "NORTH-C",
    });
    await db.insert(subscriptions).values({
      id: "sub_c",
      userId: "user_c",
      planId: "premium-monthly",
      status: "active",
      provider: "mock",
      providerSubscriptionId: "ms_c",
    });

    const created = await vpn.createAccount({
      username: "ns_usercxxxx",
      password: "secret12",
      externalCustomerId: "user_c",
    });

    await db.insert(vpnAccounts).values({
      id: "vpn_c",
      userId: "user_c",
      provider: "configured",
      providerAccountId: created.providerAccountId,
      username: created.username,
      status: "pending",
    });

    const result = await reconcileVpnProvisioning(db, vpn, email, "c4");
    // pending accounts go through provision retry (idempotent getAccount), not sync
    expect(result.repaired.concat(result.synced)).toContain("user_c");
    const [row] = await db.select().from(vpnAccounts);
    expect(row?.status).toBe("active");
    await close();
  });

  it("suspend disables VPN and soft-revokes connections", async () => {
    await db.insert(users).values({
      id: "user_d",
      email: "d@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "active",
      referralCode: "NORTH-D",
    });
    await db.insert(subscriptions).values({
      id: "sub_d",
      userId: "user_d",
      planId: "premium-monthly",
      status: "active",
      provider: "mock",
      providerSubscriptionId: "ms_d",
    });

    await provisionVpnForUser(db, vpn, email, "user_d", "c5");
    const [account] = await db.select().from(vpnAccounts);
    await syncLocationsFromProvider(db, vpn, false);
    const [loc] = await db.select().from(vpnLocations);
    await db.insert(vpnConnections).values({
      id: "conn_d",
      userId: "user_d",
      vpnAccountId: account!.id,
      locationId: loc!.id,
      name: "Phone",
      protocol: "wireguard",
    });

    await suspendVpnForUser(db, vpn, "user_d", "c6", "admin_1");
    const [after] = await db.select().from(vpnAccounts);
    expect(after?.status).toBe("disabled");
    const [conn] = await db.select().from(vpnConnections);
    expect(conn?.revokedAt).toBeTruthy();
    await close();
  });

  it("refuses VPN provision without an active subscription", async () => {
    await db.insert(users).values({
      id: "user_f",
      email: "f@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "customer",
      referralCode: "NORTH-F",
    });

    await expect(provisionVpnForUser(db, vpn, email, "user_f", "c9")).rejects.toThrow(
      /Active subscription required/,
    );
    const accounts = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, "user_f"));
    expect(accounts).toHaveLength(0);
    await close();
  });

  it("provider failure leaves structured error then reconcile repairs", async () => {
    await db.insert(users).values({
      id: "user_e",
      email: "e@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "subscribed",
      referralCode: "NORTH-E",
    });
    await db.insert(subscriptions).values({
      id: "sub_e",
      userId: "user_e",
      planId: "premium-monthly",
      status: "active",
      provider: "mock",
      providerSubscriptionId: "ms_e",
    });

    const failing = new MockVPNProvider();
    failing.createAccount = async () => {
      throw new VpnProviderError("boom", "unavailable", true);
    };
    failing.findAccountByUsername = async () => null;

    await expect(provisionVpnForUser(db, failing, email, "user_e", "c7")).rejects.toBeInstanceOf(
      VpnProviderError,
    );
    const [row] = await db.select().from(vpnAccounts);
    expect(row?.status).toBe("error");
    expect(row?.lastError).toContain("unavailable");

    await provisionVpnForUser(db, vpn, email, "user_e", "c8");
    const [fixed] = await db.select().from(vpnAccounts);
    expect(fixed?.status).toBe("active");
    await close();
  });
});
