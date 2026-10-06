import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createDb,
  migrate,
  users,
  vpnAccounts,
  vpnConnections,
  vpnLocations,
  type Db,
} from "@northstar/db";
import { ensureDefaultWireGuardConnection } from "./default-connection";

function tempDbPath() {
  return path.join(os.tmpdir(), `northstar-default-conn-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

describe("ensureDefaultWireGuardConnection", () => {
  const paths: string[] = [];

  afterEach(() => {
    for (const p of paths) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
    paths.length = 0;
  });

  async function setup(): Promise<{ db: Db; file: string; userId: string; accountId: string }> {
    const file = tempDbPath();
    paths.push(file);
    migrate(`file:${file}`);
    const { db } = createDb(`file:${file}`);
    const userId = "user_default_conn";
    const accountId = "vacct_default";
    await db.insert(users).values({
      id: userId,
      email: "default-conn@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "subscribed",
      referralCode: "TEST-DEF1",
    });
    await db.insert(vpnLocations).values([
      {
        id: "loc_de",
        providerId: "de-1",
        country: "Germany",
        countryCode: "DE",
        city: "Frankfurt",
        hostname: "de.example",
        status: "online",
        protocolSupportJson: '["wireguard","openvpn"]',
        isFixture: true,
      },
      {
        id: "loc_uk",
        providerId: "uk-1",
        country: "United Kingdom",
        countryCode: "GB",
        city: "London",
        hostname: "uk.example",
        status: "online",
        protocolSupportJson: '["wireguard","openvpn"]',
        isFixture: true,
      },
    ]);
    await db.insert(vpnAccounts).values({
      id: accountId,
      userId,
      provider: "mock",
      providerAccountId: "mock_1",
      username: "ns_test",
      status: "active",
      provisionAttempts: 1,
    });
    return { db, file, userId, accountId };
  }

  it("creates a WireGuard connection preferring UK", async () => {
    const { db, userId, accountId } = await setup();
    const connId = await ensureDefaultWireGuardConnection(db, userId, accountId);
    expect(connId).toBeTruthy();
    const rows = await db.select().from(vpnConnections).where(eq(vpnConnections.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.locationId).toBe("loc_uk");
    expect(rows[0]?.protocol).toBe("wireguard");
  });

  it("is idempotent when a connection already exists", async () => {
    const { db, userId, accountId } = await setup();
    const first = await ensureDefaultWireGuardConnection(db, userId, accountId);
    const second = await ensureDefaultWireGuardConnection(db, userId, accountId);
    expect(second).toBe(first);
    const rows = await db.select().from(vpnConnections).where(eq(vpnConnections.userId, userId));
    expect(rows).toHaveLength(1);
  });
});
