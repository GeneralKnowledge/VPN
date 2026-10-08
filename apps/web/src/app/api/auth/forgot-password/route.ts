import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { users } from "@northstar/db";
import { createVerificationToken, writeAudit } from "@/lib/auth";
import { handle, parseBody } from "@/lib/http";
import { sendEmailSafe } from "@/lib/notify";
import { appUrl, getDb, getEmailProvider, isProduction } from "@/lib/providers";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { correlationId } from "@/lib/utils";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, schema);
    const email = body.email.toLowerCase();
    enforceRateLimit("forgot", [`email:${email}`], 3, 15 * 60_000);
    enforceRateLimit("forgot", [clientIp(req) ? `ip:${clientIp(req)}` : null], 20, 15 * 60_000);

    const db = getDb();
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);
    const user = rows[0];
    const message = "If that email exists, a reset link was sent.";
    if (!user) return Response.json({ message });

    const token = await createVerificationToken(db, user.id, "password_reset");
    const link = `${appUrl()}/reset-password?token=${token}`;
    await sendEmailSafe(getEmailProvider(), {
      to: user.email,
      template: "password_reset",
      vars: { name: user.name ?? "there", link },
      correlationId: correlationId(),
    });
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "auth.password_reset_requested",
      targetType: "user",
      targetId: user.id,
    });
    const payload: { message: string; devResetUrl?: string } = { message };
    if (!isProduction()) payload.devResetUrl = link;
    return Response.json(payload);
  });
}
