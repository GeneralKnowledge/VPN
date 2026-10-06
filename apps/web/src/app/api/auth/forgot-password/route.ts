import { z } from "zod";
import { eq } from "drizzle-orm";
import { users } from "@northstar/db";
import { createVerificationToken, writeAudit } from "@/lib/auth";
import { getDb, getEmailProvider } from "@/lib/providers";
import { correlationId } from "@/lib/utils";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: "Invalid email" }, { status: 400 });
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.email, body.data.email.toLowerCase())).limit(1);
  const user = rows[0];
  const message = "If that email exists, a reset link was sent.";
  if (!user) return Response.json({ message });

  const token = await createVerificationToken(db, user.id, "password_reset");
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const link = `${appUrl}/reset-password?token=${token}`;
  await getEmailProvider().send({
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
  if (process.env.APP_ENV !== "production") payload.devResetUrl = link;
  return Response.json(payload);
}
