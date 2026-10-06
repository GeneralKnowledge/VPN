import { z } from "zod";
import { eq } from "drizzle-orm";
import { users } from "@northstar/db";
import { consumeVerificationToken, writeAudit } from "@/lib/auth";
import { getDb } from "@/lib/providers";

const schema = z.object({ token: z.string().min(10) });

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: "Invalid token" }, { status: 400 });
  const db = getDb();
  const userId = await consumeVerificationToken(db, body.data.token, "email_verify");
  if (!userId) return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  await db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
  await writeAudit(db, {
    actorId: userId,
    actorType: "user",
    action: "auth.email_verified",
    targetType: "user",
    targetId: userId,
  });
  return Response.json({ ok: true });
}
