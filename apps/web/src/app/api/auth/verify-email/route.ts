import { z } from "zod";
import { eq } from "drizzle-orm";
import { users } from "@northstar/db";
import { consumeVerificationToken, writeAudit } from "@/lib/auth";
import { handle, HttpError, parseBody } from "@/lib/http";
import { getDb } from "@/lib/providers";

const schema = z.object({ token: z.string().min(10).max(256) });

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, schema);
    const db = getDb();
    const userId = await consumeVerificationToken(db, body.token, "email_verify");
    if (!userId) throw new HttpError(400, "Invalid or expired token");
    await db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
    await writeAudit(db, {
      actorId: userId,
      actorType: "user",
      action: "auth.email_verified",
      targetType: "user",
      targetId: userId,
    });
    return Response.json({ ok: true });
  });
}
