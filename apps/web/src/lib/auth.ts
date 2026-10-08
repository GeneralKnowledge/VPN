import { createHash, createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull, lt, ne } from "drizzle-orm";
import {
  auditEvents,
  sessions,
  users,
  verificationTokens,
  type Db,
} from "@northstar/db";
import { cookies } from "next/headers";
import { getDb, getEnv, isProduction } from "./providers";
import { newId } from "./utils";

export const SESSION_COOKIE = "northstar_session";
const SESSION_DAYS = 14;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: "customer" | "admin";
  lifecycle: string;
  emailVerifiedAt: Date | null;
  referralCode: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateReferralCode(): string {
  return `NORTH-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/** Cookie value is a random bearer token; only its keyed hash is stored, so a DB leak cannot be replayed. */
function sessionKey(token: string): string {
  return createHmac("sha256", getEnv().AUTH_SECRET).update(token).digest("hex");
}

export async function createSession(db: Db, userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: sessionKey(token), userId, expiresAt });
  return token;
}

export async function destroySession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionKey(token)));
}

/** Revoke every session for a user, optionally keeping the one making the request. */
export async function destroyUserSessions(db: Db, userId: string, keepToken?: string) {
  const condition = keepToken
    ? and(eq(sessions.userId, userId), ne(sessions.id, sessionKey(keepToken)))
    : eq(sessions.userId, userId);
  await db.delete(sessions).where(condition);
}

/** Opportunistic cleanup of expired sessions (called from reconcile). */
export async function purgeExpiredSessions(db: Db) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export function setSessionCookie(jar: Awaited<ReturnType<typeof cookies>>, token: string) {
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const db = getDb();
  const row = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      lifecycle: users.lifecycle,
      emailVerifiedAt: users.emailVerifiedAt,
      referralCode: users.referralCode,
      deletedAt: users.deletedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionKey(sessionId)), gt(sessions.expiresAt, new Date()), isNull(users.deletedAt)))
    .limit(1);
  const user = row[0];
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    lifecycle: user.lifecycle,
    emailVerifiedAt: user.emailVerifiedAt,
    referralCode: user.referralCode,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Not authenticated");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new AuthError("Admin access required", 403);
  return user;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export async function writeAudit(
  db: Db,
  input: {
    actorId?: string | null;
    actorType: "user" | "admin" | "system" | "webhook";
    action: string;
    targetType: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
    correlationId?: string;
  },
) {
  // Strip likely secrets from metadata (never audit VPN configs / keys)
  const meta = input.metadata ? { ...input.metadata } : undefined;
  if (meta) {
    for (const key of Object.keys(meta)) {
      if (/password|secret|token|key|credential|private|authorization|config|wg_/i.test(key)) {
        delete meta[key];
      }
    }
  }
  await db.insert(auditEvents).values({
    id: newId("aud"),
    actorId: input.actorId ?? null,
    actorType: input.actorType,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadataJson: meta ? JSON.stringify(meta) : null,
    correlationId: input.correlationId,
  });
}

export async function createVerificationToken(
  db: Db,
  userId: string,
  type: "email_verify" | "password_reset",
): Promise<string> {
  // Only the newest link is valid: retire earlier unused tokens of the same type.
  await db
    .update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(verificationTokens.userId, userId),
        eq(verificationTokens.type, type),
        isNull(verificationTokens.usedAt),
      ),
    );
  const token = randomBytes(32).toString("hex");
  await db.insert(verificationTokens).values({
    id: newId("vtk"),
    userId,
    type,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + (type === "password_reset" ? 1000 * 60 * 60 : 1000 * 60 * 60 * 24)),
  });
  return token;
}

/** Atomically claim a token: a single conditional UPDATE so concurrent requests cannot both succeed. */
export async function consumeVerificationToken(
  db: Db,
  token: string,
  type: "email_verify" | "password_reset",
): Promise<string | null> {
  const claimed = await db
    .update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(verificationTokens.tokenHash, hashToken(token)),
        eq(verificationTokens.type, type),
        gt(verificationTokens.expiresAt, new Date()),
        isNull(verificationTokens.usedAt),
      ),
    )
    .returning({ userId: verificationTokens.userId });
  return claimed[0]?.userId ?? null;
}

export { hashToken };
