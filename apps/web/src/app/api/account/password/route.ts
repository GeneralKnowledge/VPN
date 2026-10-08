import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { users } from "@northstar/db";
import { z } from "zod";
import { SESSION_COOKIE, destroyUserSessions, hashPassword, requireUser, verifyPassword, writeAudit } from "@/lib/auth";
import { handle, HttpError, parseBody } from "@/lib/http";
import { sendEmailSafe } from "@/lib/notify";
import { getDb, getEmailProvider } from "@/lib/providers";
import { assertNotRateLimited, recordRateLimitHit } from "@/lib/rate-limit";
import { correlationId } from "@/lib/utils";

const schema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await parseBody(req, schema);
    assertNotRateLimited("change-password", [`user:${user.id}`], 5);

    const db = getDb();
    const row = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
    if (!row || !(await verifyPassword(body.currentPassword, row.passwordHash))) {
      recordRateLimitHit("change-password", [`user:${user.id}`], 15 * 60_000);
      throw new HttpError(400, "Current password incorrect");
    }
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.newPassword), updatedAt: new Date() })
      .where(eq(users.id, user.id));
    // Keep this device signed in; every other session must re-authenticate.
    const currentToken = (await cookies()).get(SESSION_COOKIE)?.value;
    await destroyUserSessions(db, user.id, currentToken);

    await sendEmailSafe(getEmailProvider(), {
      to: user.email,
      template: "security_notification",
      vars: { name: user.name ?? "there", message: "Your password was changed." },
      correlationId: correlationId(),
    });
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "auth.password_changed",
      targetType: "user",
      targetId: user.id,
    });
    return Response.json({ ok: true });
  });
}
