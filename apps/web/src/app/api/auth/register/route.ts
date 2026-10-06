import { z } from "zod";
import { eq } from "drizzle-orm";
import { referrals, users } from "@northstar/db";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  createSession,
  createVerificationToken,
  generateReferralCode,
  hashPassword,
  writeAudit,
} from "@/lib/auth";
import { getDb, getEmailProvider, track } from "@/lib/providers";
import { correlationId, newId } from "@/lib/utils";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
  planId: z.string().optional(),
  referralCode: z.string().optional(),
});

export async function POST(req: Request) {
  const corr = correlationId();
  track({ name: "signup_started" });
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const db = getDb();
  const existing = await db.select().from(users).where(eq(users.email, body.data.email.toLowerCase())).limit(1);
  if (existing[0]) {
    return Response.json({ error: "Email already registered" }, { status: 409 });
  }

  let referrerId: string | undefined;
  if (body.data.referralCode) {
    const ref = await db
      .select()
      .from(users)
      .where(eq(users.referralCode, body.data.referralCode.toUpperCase()))
      .limit(1);
    referrerId = ref[0]?.id;
  }

  const userId = newId("user");
  await db.insert(users).values({
    id: userId,
    email: body.data.email.toLowerCase(),
    passwordHash: await hashPassword(body.data.password),
    name: body.data.name,
    role: "customer",
    lifecycle: "customer",
    referralCode: generateReferralCode(),
    referredByUserId: referrerId,
    emailVerifiedAt: process.env.APP_ENV === "production" ? null : new Date(),
  });

  if (referrerId) {
    await db.insert(referrals).values({
      id: newId("ref"),
      referrerUserId: referrerId,
      referredUserId: userId,
      status: "pending",
    });
  }

  const token = await createVerificationToken(db, userId, "email_verify");
  const email = getEmailProvider();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await email.send({
    to: body.data.email,
    template: "welcome",
    vars: { name: body.data.name },
    correlationId: corr,
  });
  await email.send({
    to: body.data.email,
    template: "verify_email",
    vars: { name: body.data.name, link: `${appUrl}/verify-email?token=${token}` },
    correlationId: corr,
  });

  await writeAudit(db, {
    actorId: userId,
    actorType: "user",
    action: "account.created",
    targetType: "user",
    targetId: userId,
    correlationId: corr,
    metadata: { email: body.data.email.toLowerCase() },
  });

  const sessionId = await createSession(db, userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });

  track({ name: "signup_completed", userId });
  const redirectTo = body.data.planId
    ? `/dashboard/billing?plan=${encodeURIComponent(body.data.planId)}`
    : "/dashboard";
  return Response.json({ ok: true, redirectTo });
}
