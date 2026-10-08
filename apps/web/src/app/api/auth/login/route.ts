import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { users } from "@northstar/db";
import { cookies } from "next/headers";
import { createSession, hashPassword, setSessionCookie, verifyPassword, writeAudit } from "@/lib/auth";
import { handle, HttpError, parseBody } from "@/lib/http";
import { getDb, track } from "@/lib/providers";
import { assertNotRateLimited, clientIp, recordRateLimitHit } from "@/lib/rate-limit";
import { correlationId } from "@/lib/utils";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256),
});

const FAIL_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES_PER_EMAIL = 10;
const MAX_FAILURES_PER_IP = 50;

// Compared against when the account does not exist so response time does not reveal which emails are registered.
let dummyHash: Promise<string> | null = null;
function getDummyHash() {
  dummyHash ??= hashPassword("northstar-dummy-password");
  return dummyHash;
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, schema);
    const email = body.email.toLowerCase();
    const ip = clientIp(req);
    const keys = [`email:${email}`, ip ? `ip:${ip}` : null];
    assertNotRateLimited("login", [keys[0]], MAX_FAILURES_PER_EMAIL);
    assertNotRateLimited("login", [keys[1]], MAX_FAILURES_PER_IP);

    const db = getDb();
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);
    const user = rows[0];
    const valid = await verifyPassword(body.password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !valid) {
      recordRateLimitHit("login", keys, FAIL_WINDOW_MS);
      throw new HttpError(401, "Invalid email or password");
    }

    const token = await createSession(db, user.id);
    setSessionCookie(await cookies(), token);

    await writeAudit(db, {
      actorId: user.id,
      actorType: user.role === "admin" ? "admin" : "user",
      action: "auth.login",
      targetType: "user",
      targetId: user.id,
      correlationId: correlationId(),
    });

    track({ name: "login_completed", userId: user.id });
    return Response.json({ ok: true, redirectTo: user.role === "admin" ? "/admin" : "/dashboard" });
  });
}
