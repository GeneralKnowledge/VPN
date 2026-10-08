import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { users } from "@northstar/db";
import { consumeVerificationToken, destroyUserSessions, hashPassword, writeAudit } from "@/lib/auth";
import { handle, HttpError, parseBody } from "@/lib/http";
import { sendEmailSafe } from "@/lib/notify";
import { getDb, getEmailProvider } from "@/lib/providers";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { correlationId } from "@/lib/utils";

const schema = z.object({
  token: z.string().min(10).max(256),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, schema);
    enforceRateLimit("reset", [clientIp(req) ? `ip:${clientIp(req)}` : null], 20, 15 * 60_000);
    const db = getDb();
    const userId = await consumeVerificationToken(db, body.token, "password_reset");
    if (!userId) throw new HttpError(400, "Invalid or expired token");

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!user) throw new HttpError(400, "Invalid or expired token");

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.password), updatedAt: new Date() })
      .where(eq(users.id, userId));
    // A reset is usually a response to compromise: sign out every existing session.
    await destroyUserSessions(db, userId);

    await sendEmailSafe(getEmailProvider(), {
      to: user.email,
      template: "security_notification",
      vars: { name: user.name ?? "there", message: "Your password was changed and all sessions were signed out." },
      correlationId: correlationId(),
    });
    await writeAudit(db, {
      actorId: userId,
      actorType: "user",
      action: "auth.password_changed",
      targetType: "user",
      targetId: userId,
    });
    return Response.json({ ok: true });
  });
}
