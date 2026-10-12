import { z } from "zod";
import { eq, or } from "drizzle-orm";
import { getPlan, tierRequiresEmail } from "@northstar/config";
import { referrals, users } from "@northstar/db";
import { cookies } from "next/headers";
import {
  USERNAME_PATTERN,
  createSession,
  createVerificationToken,
  generateReferralCode,
  hashPassword,
  normaliseUsername,
  setSessionCookie,
  writeAudit,
} from "@/lib/auth";
import { handle, HttpError, parseBody } from "@/lib/http";
import { sendEmailSafe } from "@/lib/notify";
import { appUrl, emailVerificationRequired, getDb, getEmailProvider, track } from "@/lib/providers";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { correlationId, newId } from "@/lib/utils";

const schema = z
  .object({
    username: z.string().min(3).max(32),
    email: z.string().max(254).optional(),
    password: z.string().min(8).max(128),
    name: z.string().max(100).optional(),
    planId: z.string().max(64).optional(),
    referralCode: z.string().max(32).optional(),
  })
  .superRefine((data, ctx) => {
    const username = normaliseUsername(data.username);
    if (!USERNAME_PATTERN.test(username)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Username must be 3–32 characters and start with a letter or number",
        path: ["username"],
      });
    }
    const email = data.email?.trim();
    if (email && !z.string().email().safeParse(email).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid email address", path: ["email"] });
    }
    const plan = data.planId ? getPlan(data.planId) : getPlan("platinum-monthly");
    if (plan && tierRequiresEmail(plan.tier) && !email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${plan.name} requires an email address`,
        path: ["email"],
      });
    }
  });

export async function POST(req: Request) {
  return handle(async () => {
    const corr = correlationId();
    track({ name: "signup_started" });
    const body = await parseBody(req, schema);
    const ip = clientIp(req);
    enforceRateLimit("register", [ip ? `ip:${ip}` : null], 10, 60 * 60_000);

    const db = getDb();
    const username = normaliseUsername(body.username);
    const email = body.email?.trim() ? body.email.trim().toLowerCase() : null;
    const plan = body.planId ? getPlan(body.planId) : undefined;

    const existing = await db
      .select()
      .from(users)
      .where(email ? or(eq(users.username, username), eq(users.email, email)) : eq(users.username, username))
      .limit(1);
    if (existing[0]) {
      if (existing[0].username === username) throw new HttpError(409, "Username already taken");
      throw new HttpError(409, "Email already registered");
    }

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
    const name = body.name?.trim() || null;
    try {
      await db.insert(users).values({
        id: userId,
        username,
        email,
        passwordHash: await hashPassword(body.password),
        name,
        role: "customer",
        lifecycle: "customer",
        referralCode: generateReferralCode(),
        referredByUserId: referrerId,
        emailVerifiedAt: email && !emailVerificationRequired() ? new Date() : email ? null : new Date(),
      });
    } catch (err) {
      const raced = await db
        .select()
        .from(users)
        .where(email ? or(eq(users.username, username), eq(users.email, email)) : eq(users.username, username))
        .limit(1);
      if (raced[0]?.username === username) throw new HttpError(409, "Username already taken");
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
    if (email) {
      await sendEmailSafe(emailProvider, {
        to: email,
        template: "welcome",
        vars: { name: name ?? username },
        correlationId: corr,
      });
      if (emailVerificationRequired()) {
        const token = await createVerificationToken(db, userId, "email_verify");
        await sendEmailSafe(emailProvider, {
          to: email,
          template: "verify_email",
          vars: { name: name ?? username, link: `${appUrl()}/verify-email?token=${token}` },
          correlationId: corr,
        });
      }
    }

    await writeAudit(db, {
      actorId: userId,
      actorType: "user",
      action: "account.created",
      targetType: "user",
      targetId: userId,
      correlationId: corr,
      metadata: { username, hasEmail: Boolean(email), planId: plan?.id ?? null },
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
    return Response.json({
      ok: true,
      redirectTo,
      username,
      // Remind username-only signups there is no email recovery.
      recoveryHint: email
        ? null
        : "Save your username and password. Without an email we cannot reset access for you.",
    });
  });
}
