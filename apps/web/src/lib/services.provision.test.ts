import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
}));

import { eq } from "drizzle-orm";
import { createDb, migrate, users, vpnAccounts, type Db } from "@northstar/db";
import {
  MockVPNProvider,
  VpnProviderError,
  type VPNProvider,
} from "@northstar/vpn-provider";
import type { EmailProvider } from "@northstar/email";
import { provisionVpnForUser } from "./services";

function tempDbPath() {
  return path.join(os.tmpdir(), `northstar-provision-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

function countingProvider(): VPNProvider & { creates: number } {
  const inner = new MockVPNProvider();
  const wrapper: VPNProvider & { creates: number } = {
    creates: 0,
    getProviderStatus: () => inner.getProviderStatus(),
    listLocations: () => inner.listLocations(),
    createAccount: async (input) => {
      wrapper.creates += 1;
      return inner.createAccount(input);
    },
    getAccount: (id) => inner.getAccount(id),
    suspendAccount: (id) => inner.suspendAccount(id),
    reactivateAccount: (id) => inner.reactivateAccount(id),
    deleteAccount: (id) => inner.deleteAccount(id),
    getConnectionConfig: (input) => inner.getConnectionConfig(input),
  };
  return wrapper;
}

const silentEmail: EmailProvider = {
  getProviderStatus: async () => ({ ok: true, provider: "mock" }),
  send: async () => ({ id: "email_test" }),
};

describe("provisionVpnForUser money-safety", () => {
  let dbPath = "";
  let db: Db;
  let sqlite: { close: () => void };

  beforeEach(async () => {
    dbPath = tempDbPath();
    process.env.NORTHSTAR_ROOT = os.tmpdir();
    migrate(`file:${dbPath}`);
    const created = createDb(`file:${dbPath}`);
    db = created.db;
    sqlite = created.sqlite;

    await db.insert(users).values({
      id: "user_test_provision",
      email: "provision@test.local",
      passwordHash: "x",
      name: "Prov",
      role: "customer",
      lifecycle: "subscribed",
      referralCode: "NORTH-TESTPROV",
    });
  });

  afterEach(() => {
    sqlite.close();
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  });

  it("calls createAccount only once across repeated provision attempts", async () => {
    const vpn = countingProvider();
    await provisionVpnForUser(db, vpn, silentEmail, "user_test_provision", "corr_1");
    await provisionVpnForUser(db, vpn, silentEmail, "user_test_provision", "corr_2");
    await provisionVpnForUser(db, vpn, silentEmail, "user_test_provision", "corr_3");
    expect(vpn.creates).toBe(1);

    const mine = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, "user_test_provision"));
    expect(mine).toHaveLength(1);
    expect(mine[0]?.status).toBe("active");
  });

  it("does not create a second provider account when getAccount fails transiently", async () => {
    const vpn = countingProvider();
    await provisionVpnForUser(db, vpn, silentEmail, "user_test_provision", "corr_ok");
    expect(vpn.creates).toBe(1);

    await db
      .update(vpnAccounts)
      .set({ status: "error", lastError: "simulated", updatedAt: new Date() })
      .where(eq(vpnAccounts.userId, "user_test_provision"));

    const flaky: VPNProvider = {
      ...vpn,
      getAccount: async () => {
        throw new VpnProviderError("timeout", "timeout", true);
      },
      createAccount: async () => {
        vpn.creates += 1;
        throw new Error("create must not be called on transient getAccount failure");
      },
    };

    await expect(
      provisionVpnForUser(db, flaky, silentEmail, "user_test_provision", "corr_retry"),
    ).rejects.toBeInstanceOf(VpnProviderError);
    expect(vpn.creates).toBe(1);
  });

  it("concurrent claims only create once at the provider", async () => {
    const vpn = countingProvider();
    await Promise.all([
      provisionVpnForUser(db, vpn, silentEmail, "user_test_provision", "corr_a"),
      provisionVpnForUser(db, vpn, silentEmail, "user_test_provision", "corr_b"),
      provisionVpnForUser(db, vpn, silentEmail, "user_test_provision", "corr_c"),
    ]);
    expect(vpn.creates).toBe(1);
    const all = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, "user_test_provision"));
    expect(all).toHaveLength(1);
  });
});
