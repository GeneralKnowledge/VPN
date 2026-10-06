import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { users } from "@northstar/db";
import { cookies } from "next/headers";
import { SESSION_COOKIE, createSession, verifyPassword, writeAudit } from "@/lib/auth";
import { getDb, track } from "@/lib/providers";
import { correlationId } from "@/lib/utils";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Simple in-memory rate limit for login attempts (per process)
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const row = attempts.get(key);
  if (!row || row.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (row.count >= limit) return false;
  row.count += 1;
  return true;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`login:${ip}`)) {
    return Response.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.email, body.data.email.toLowerCase()), isNull(users.deletedAt)))
    .limit(1);
  const user = rows[0];
  if (!user || !(await verifyPassword(body.data.password, user.passwordHash))) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const sessionId = await createSession(db, user.id);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });

  await writeAudit(db, {
    actorId: user.id,
    actorType: user.role === "admin" ? "admin" : "user",
    action: "auth.login",
    targetType: "user",
    targetId: user.id,
    correlationId: correlationId(),
  });

  track({ name: "login_completed", userId: user.id });
  const redirectTo = user.role === "admin" ? "/admin" : "/dashboard";
  return Response.json({ ok: true, redirectTo });
}
