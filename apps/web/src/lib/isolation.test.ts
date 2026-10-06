import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import {
  createDb,
  migrate,
  plans,
  users,
  vpnAccounts,
  vpnConnections,
  vpnLocations,
} from "@northstar/db";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Regression: User A must not be able to resolve User B's connection/config by ID.
 * Mirrors ownership checks in /api/vpn/config and /api/vpn/connections.
 */
describe("customer isolation", () => {
  it("connection lookup is scoped by userId", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-iso-"));
    const databaseUrl = `file:${path.join(dir, "test.db")}`;
    process.env.NORTHSTAR_ROOT = dir;
    migrate(databaseUrl);
    const { db, close } = createDb(databaseUrl);

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

    await db.insert(users).values([
      {
        id: "user_a",
        email: "a@test.local",
        passwordHash: "x",
        role: "customer",
        lifecycle: "active",
        referralCode: "NORTH-A",
      },
      {
        id: "user_b",
        email: "b@test.local",
        passwordHash: "x",
        role: "customer",
        lifecycle: "active",
        referralCode: "NORTH-B",
      },
    ]);

    await db.insert(vpnAccounts).values([
      {
        id: "vpn_a",
        userId: "user_a",
        provider: "mock",
        providerAccountId: "pva_a",
        username: "ns_a",
        status: "active",
      },
      {
        id: "vpn_b",
        userId: "user_b",
        provider: "mock",
        providerAccountId: "pva_b",
        username: "ns_b",
        status: "active",
      },
    ]);

    await db.insert(vpnLocations).values({
      id: "loc_1",
      providerId: "srv-1",
      country: "United Kingdom",
      countryCode: "GB",
      city: "London",
      hostname: "lon.mock",
      status: "online",
      protocolSupportJson: '["wireguard"]',
      isFixture: true,
    });

    await db.insert(vpnConnections).values({
      id: "conn_b",
      userId: "user_b",
      vpnAccountId: "vpn_b",
      locationId: "loc_1",
      name: "B laptop",
      protocol: "wireguard",
    });

    // User A queries User B's connection id with ownership filter — must be empty
    const stolen = await db
      .select()
      .from(vpnConnections)
      .where(
        and(
          eq(vpnConnections.id, "conn_b"),
          eq(vpnConnections.userId, "user_a"),
          isNull(vpnConnections.revokedAt),
        ),
      );
    expect(stolen).toHaveLength(0);

    const owner = await db
      .select()
      .from(vpnConnections)
      .where(
        and(
          eq(vpnConnections.id, "conn_b"),
          eq(vpnConnections.userId, "user_b"),
          isNull(vpnConnections.revokedAt),
        ),
      );
    expect(owner).toHaveLength(1);

    await close();
  });
});
