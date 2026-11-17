import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, migrate, users } from "@northstar/db";
import { MockEsimProvider } from "@northstar/esim-provider";
import { MockEmailProvider } from "@northstar/email";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ctx = vi.hoisted(() => ({
  db: null as unknown,
  authorization: null as string | null,
}));

vi.mock("@/lib/providers", () => ({
  getDb: () => ctx.db,
  getEnv: () => ({
    AUTH_SECRET: "test-secret-test-secret-test-secret",
    BILLING_PROVIDER: "mock",
    ESIM_PROVIDER: "mock",
  }),
  isProduction: () => false,
  emailVerificationRequired: () => false,
  getEsimProvider: () => new MockEsimProvider(),
  getEmailProvider: () => new MockEmailProvider(),
  getOneTimePayments: () => null,
  appUrl: () => "https://sim.example.com",
  track: () => undefined,
}));

// The app sends no cookies and no product host header, only its bearer token.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(ctx.authorization ? { authorization: ctx.authorization } : {}),
}));

import { hashPassword } from "@/lib/auth";
import { POST as signIn } from "@/app/api/app/session/route";
import { GET as packages } from "@/app/api/esim/packages/route";
import { POST as checkout } from "@/app/api/esim/checkout/route";
import { POST as complete } from "@/app/api/esim/complete/route";
import { GET as orders } from "@/app/api/esim/orders/route";

function json(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("eSIM API from the native app", () => {
  beforeEach(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-app-esim-"));
    const url = `file:${path.join(dir, "t.db")}`;
    process.env.NORTHSTAR_ROOT = dir;
    migrate(url);
    const db = createDb(url).db;
    ctx.db = db;
    ctx.authorization = null;
    await db.insert(users).values({
      id: "u1",
      username: "alice",
      email: "alice@test.local",
      passwordHash: await hashPassword("correct horse"),
      role: "customer",
      lifecycle: "customer",
      referralCode: "R1",
    });
  });

  async function signedIn() {
    const res = await signIn(json("http://vpn.local/api/app/session", { login: "alice", password: "correct horse" }));
    const { token } = (await res.json()) as { token: string };
    ctx.authorization = `Bearer ${token}`;
  }

  it("keeps eSIM routes off the VPN host for browsers and made-up tokens", async () => {
    expect((await packages(new Request("http://vpn.local/api/esim/packages"))).status).toBe(404);
    ctx.authorization = `Bearer ${"a".repeat(64)}`;
    expect((await packages(new Request("http://vpn.local/api/esim/packages"))).status).toBe(401);
  });

  it("lists packages, buys one and shows the issued eSIM", async () => {
    await signedIn();
    const list = (await (await packages(new Request("http://vpn.local/api/esim/packages?country=GB"))).json()) as {
      packages: Array<{ code: string }>;
    };
    expect(list.packages.length).toBeGreaterThan(0);

    const started = await checkout(json("http://vpn.local/api/esim/checkout", { packageCode: list.packages[0]!.code }));
    expect(started.status).toBe(200);
    const body = (await started.json()) as { url: string; sessionId: string };
    // The app opens this in a browser, so it must be absolute.
    expect(body.url).toMatch(/^https:\/\/sim\.example\.com\/billing\/mock-esim-checkout\?session_id=/);

    // Mock billing only: the app completes the mock payment itself.
    expect((await complete(json("http://vpn.local/api/esim/complete", { sessionId: body.sessionId }))).status).toBe(200);

    const mine = (await (await orders()).json()) as {
      orders: Array<{ status: string; profile: { iccid: string | null } | null }>;
    };
    expect(mine.orders).toHaveLength(1);
    expect(mine.orders[0]!.status).toBe("issued");
    expect(mine.orders[0]!.profile?.iccid).toBeTruthy();
  });
});
