import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, migrate, sessions, users } from "@northstar/db";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type TestDb = ReturnType<typeof createDb>["db"];

const ctx = vi.hoisted(() => ({
  db: null as unknown,
  authorization: null as string | null,
}));

vi.mock("@/lib/providers", () => ({
  getDb: () => ctx.db,
  getEnv: () => ({ AUTH_SECRET: "test-secret-test-secret-test-secret", BILLING_PROVIDER: "mock" }),
  isProduction: () => false,
  track: () => undefined,
}));

// The app sends no cookies, only its bearer header.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(ctx.authorization ? { authorization: ctx.authorization } : {}),
}));

import { bearerTokenFrom, hashPassword } from "@/lib/auth";
import { DELETE as signOut, POST as signIn } from "@/app/api/app/session/route";
import { GET as summary } from "@/app/api/app/summary/route";

function login(body: unknown) {
  return new Request("http://localhost/api/app/session", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "NorthstarVPN-iOS/1" },
    body: JSON.stringify(body),
  });
}

describe("app sign-in API", () => {
  let db: TestDb;

  beforeEach(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-app-"));
    const url = `file:${path.join(dir, "t.db")}`;
    process.env.NORTHSTAR_ROOT = dir;
    migrate(url);
    db = createDb(url).db;
    ctx.db = db;
    ctx.authorization = null;
    const passwordHash = await hashPassword("correct horse");
    await db.insert(users).values([
      { id: "u1", username: "alice", email: "alice@test.local", passwordHash, role: "customer", lifecycle: "customer", referralCode: "R1" },
      { id: "a1", username: "admin", email: "admin@test.local", passwordHash, role: "admin", lifecycle: "customer", referralCode: "R2" },
    ]);
  });

  it("parses only well-formed bearer headers", () => {
    const token = "a".repeat(64);
    expect(bearerTokenFrom(`Bearer ${token}`)).toBe(token);
    expect(bearerTokenFrom(`bearer ${token.toUpperCase()}`)).toBe(token);
    expect(bearerTokenFrom("Bearer short")).toBeNull();
    expect(bearerTokenFrom(`Basic ${token}`)).toBeNull();
    expect(bearerTokenFrom(null)).toBeNull();
  });

  it("signs in, reads the summary with the token, and signs out", async () => {
    const res = await signIn(login({ login: "alice", password: "correct horse" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; user: { username: string } };
    expect(body.token).toMatch(/^[0-9a-f]{64}$/);
    expect(body.user.username).toBe("alice");
    // Only a keyed hash of the token is stored.
    const stored = await db.select().from(sessions);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id).not.toBe(body.token);
    expect(stored[0]!.userAgent).toBe("NorthstarVPN-iOS/1");

    expect((await summary()).status).toBe(401);
    ctx.authorization = `Bearer ${body.token}`;
    const home = await summary();
    expect(home.status).toBe(200);
    expect(await home.json()).toMatchObject({
      user: { username: "alice" },
      subscription: null,
      vpn: { ready: false },
      devices: { active: 0 },
    });

    expect((await signOut()).status).toBe(200);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect((await summary()).status).toBe(401);
  });

  it("refuses a wrong password and admin accounts", async () => {
    expect((await signIn(login({ login: "alice", password: "wrong" }))).status).toBe(401);
    expect((await signIn(login({ login: "admin@test.local", password: "correct horse" }))).status).toBe(403);
    expect(await db.select().from(sessions)).toHaveLength(0);
  });
});
