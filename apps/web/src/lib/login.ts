import { and, eq, isNull } from "drizzle-orm";
import { users, type Db } from "@northstar/db";
import { z } from "zod";
import { hashPassword, normaliseUsername, verifyPassword } from "./auth";
import { HttpError } from "./http";
import { assertNotRateLimited, clientIp, recordRateLimitHit } from "./rate-limit";

export const loginSchema = z
  .object({
    /** Email or username. */
    login: z.string().min(1).max(254).optional(),
    /** @deprecated Prefer `login`. Kept so older clients keep working. */
    email: z.string().min(1).max(254).optional(),
    password: z.string().min(1).max(256),
  })
  .refine((b) => Boolean(b.login?.trim() || b.email?.trim()), {
    message: "Email or username is required",
    path: ["login"],
  });

const FAIL_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES_PER_LOGIN = 10;
const MAX_FAILURES_PER_IP = 50;

// Compared against when the account does not exist so response time does not reveal which logins are registered.
let dummyHash: Promise<string> | null = null;
function getDummyHash() {
  dummyHash ??= hashPassword("northstar-dummy-password");
  return dummyHash;
}

/**
 * Checks an email-or-username and password, with the same rate limits and timing for the website
 * and the app. Throws 401 on any failure without saying which part was wrong.
 */
export async function verifyLogin(db: Db, req: Request, body: z.infer<typeof loginSchema>) {
  const raw = (body.login ?? body.email ?? "").trim();
  const looksLikeEmail = raw.includes("@");
  const loginKey = looksLikeEmail ? raw.toLowerCase() : normaliseUsername(raw);
  const ip = clientIp(req);
  const keys = [`login:${loginKey}`, ip ? `ip:${ip}` : null];
  assertNotRateLimited("login", [keys[0]], MAX_FAILURES_PER_LOGIN);
  assertNotRateLimited("login", [keys[1]], MAX_FAILURES_PER_IP);

  const rows = await db
    .select()
    .from(users)
    .where(and(isNull(users.deletedAt), looksLikeEmail ? eq(users.email, loginKey) : eq(users.username, loginKey)))
    .limit(1);
  const user = rows[0];
  const valid = await verifyPassword(body.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !valid) {
    recordRateLimitHit("login", keys, FAIL_WINDOW_MS);
    throw new HttpError(401, "Invalid username/email or password");
  }
  return { user, ip };
}
