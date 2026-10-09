import { z } from "zod";
import { eq } from "drizzle-orm";
import { referrals, users } from "@northstar/db";
import { cookies } from "next/headers";
import {
  createSession,
  createVerificationToken,
  generateReferralCode,
  hashPassword,
  setSessionCookie,
  writeAudit,
} from "@/lib/auth";
import { handle, HttpError, parseBody } from "@/lib/http";
import { sendEmailSafe } from "@/lib/notify";
import { appUrl, emailVerificationRequired, getDb, getEmailProvider, track } from "@/lib/providers";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { correlationId, newId } from "@/lib/utils";

const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
  planId: z.string().max(64).optional(),
  referralCode: z.string().max(32).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const corr = correlationId();
    track({ name: "signup_started" });
    const body = await parseBody(req, schema);
    const ip = clientIp(req);
    enforceRateLimit("register", [ip ? `ip:${ip}` : null], 10, 60 * 60_000);

    const db = getDb();
    const email = body.email.toLowerCase();
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing[0]) throw new HttpError(409, "Email already registered");

    let referrerId: string | undefined;
    if (body.referralCode) {
      const ref = await db
        .select()
        .from(users)
        .where(eq(users.referralCode, body.referralCode.toUpperCase()))
        .limit(1);
      referrerId = ref[0]?.id;
    }

    const userId = newId("user");
    try {
      await db.insert(users).values({
        id: userId,
        email,
        passwordHash: await hashPassword(body.password),
        name: body.name,
        role: "customer",
        lifecycle: "customer",
        referralCode: generateReferralCode(),
        referredByUserId: referrerId,
        emailVerifiedAt: emailVerificationRequired() ? null : new Date(),
      });
    } catch (err) {
      // Two signups racing on the same address: the unique index decides.
      const raced = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (raced[0]) throw new HttpError(409, "Email already registered");
      throw err;
    }

    if (referrerId) {
      await db.insert(referrals).values({
        id: newId("ref"),
        referrerUserId: referrerId,
        referredUserId: userId,
        status: "pending",
      });
    }

    const emailProvider = getEmailProvider();
    await sendEmailSafe(emailProvider, {
      to: email,
      template: "welcome",
      vars: { name: body.name },
      correlationId: corr,
    });
    if (emailVerificationRequired()) {
      const token = await createVerificationToken(db, userId, "email_verify");
      await sendEmailSafe(emailProvider, {
        to: email,
        template: "verify_email",
        vars: { name: body.name, link: `${appUrl()}/verify-email?token=${token}` },
        correlationId: corr,
      });
    }

    await writeAudit(db, {
      actorId: userId,
      actorType: "user",
      action: "account.created",
      targetType: "user",
      targetId: userId,
      correlationId: corr,
      metadata: { email },
    });

    const sessionToken = await createSession(db, userId, {
      userAgent: req.headers.get("user-agent"),
      ipAddress: clientIp(req),
    });
    setSessionCookie(await cookies(), sessionToken);

    track({ name: "signup_completed", userId });
    const redirectTo = body.planId
      ? `/dashboard/billing?plan=${encodeURIComponent(body.planId)}`
      : "/dashboard";
    return Response.json({ ok: true, redirectTo });
  });
}
