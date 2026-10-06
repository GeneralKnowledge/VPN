import { z } from "zod";
import { eq } from "drizzle-orm";
import { users } from "@northstar/db";
import { consumeVerificationToken, hashPassword, writeAudit } from "@/lib/auth";
import { getDb, getEmailProvider } from "@/lib/providers";
import { correlationId } from "@/lib/utils";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: "Invalid input" }, { status: 400 });
  const db = getDb();
  const userId = await consumeVerificationToken(db, body.data.token, "password_reset");
  if (!userId) return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(body.data.password), updatedAt: new Date() })
    .where(eq(users.id, userId));
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (user) {
    await getEmailProvider().send({
      to: user.email,
      template: "security_notification",
      vars: { name: user.name ?? "there", message: "Your password was changed." },
      correlationId: correlationId(),
    });
  }
  await writeAudit(db, {
    actorId: userId,
    actorType: "user",
    action: "auth.password_changed",
    targetType: "user",
    targetId: userId,
  });
  return Response.json({ ok: true });
}
