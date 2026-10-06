import { eq } from "drizzle-orm";
import { users } from "@northstar/db";
import { z } from "zod";
import { hashPassword, requireUser, verifyPassword, writeAudit } from "@/lib/auth";
import { getDb, getEmailProvider } from "@/lib/providers";
import { correlationId } from "@/lib/utils";

export async function POST(req: Request) {
  const user = await requireUser();
  const body = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
    })
    .safeParse(await req.json());
  if (!body.success) return Response.json({ error: "Invalid input" }, { status: 400 });
  const db = getDb();
  const row = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!row || !(await verifyPassword(body.data.currentPassword, row.passwordHash))) {
    return Response.json({ error: "Current password incorrect" }, { status: 400 });
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(body.data.newPassword), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await getEmailProvider().send({
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
}
