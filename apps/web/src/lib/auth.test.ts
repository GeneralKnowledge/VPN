import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrate, sessions, users } from "@northstar/db";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  consumeVerificationToken,
  createSession,
  createVerificationToken,
  destroySession,
  destroyUserSessions,
  purgeExpiredSessions,
} from "./auth";

type TestDb = ReturnType<typeof createDb>["db"];

describe("sessions and verification tokens", () => {
  let db: TestDb;

  beforeEach(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-auth-"));
    const url = `file:${path.join(dir, "t.db")}`;
    process.env.NORTHSTAR_ROOT = dir;
    migrate(url);
    db = createDb(url).db;
    await db.insert(users).values({
      id: "u1",
      email: "u1@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "customer",
      referralCode: "NORTH-U1",
    });
  });

  it("stores only a keyed hash of the session token", async () => {
    const token = await createSession(db, "u1");
    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).not.toBe(token);
    expect(rows[0]?.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("revokes every other session but keeps the current one", async () => {
    const keep = await createSession(db, "u1");
    await createSession(db, "u1");
    await createSession(db, "u1");
    await destroyUserSessions(db, "u1", keep);
    expect(await db.select().from(sessions)).toHaveLength(1);
    await destroySession(db, keep);
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it("revokes all sessions when no token is kept (password reset)", async () => {
    await createSession(db, "u1");
    await createSession(db, "u1");
    await destroyUserSessions(db, "u1");
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it("purges only expired sessions", async () => {
    await createSession(db, "u1");
    await db.insert(sessions).values({ id: "old", userId: "u1", expiresAt: new Date(Date.now() - 1000) });
    await purgeExpiredSessions(db);
    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).not.toBe("old");
  });

  it("a verification token can be consumed exactly once, even concurrently", async () => {
    const token = await createVerificationToken(db, "u1", "password_reset");
    const results = await Promise.all([
      consumeVerificationToken(db, token, "password_reset"),
      consumeVerificationToken(db, token, "password_reset"),
    ]);
    expect(results.filter(Boolean)).toEqual(["u1"]);
    expect(await consumeVerificationToken(db, token, "password_reset")).toBeNull();
  });

  it("rejects a token presented for the wrong purpose", async () => {
    const token = await createVerificationToken(db, "u1", "email_verify");
    expect(await consumeVerificationToken(db, token, "password_reset")).toBeNull();
    expect(await consumeVerificationToken(db, token, "email_verify")).toBe("u1");
  });

  it("issuing a new token retires the previous one", async () => {
    const first = await createVerificationToken(db, "u1", "password_reset");
    const second = await createVerificationToken(db, "u1", "password_reset");
    expect(await consumeVerificationToken(db, first, "password_reset")).toBeNull();
    expect(await consumeVerificationToken(db, second, "password_reset")).toBe("u1");
  });

  it("expired verification tokens are rejected", async () => {
    const token = await createVerificationToken(db, "u1", "email_verify");
    const { verificationTokens } = await import("@northstar/db");
    await db.update(verificationTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(verificationTokens.userId, "u1"));
    expect(await consumeVerificationToken(db, token, "email_verify")).toBeNull();
  });
});
