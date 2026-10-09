import { eq } from "drizzle-orm";
import { users } from "@northstar/db";
import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { handle, parseBody } from "@/lib/http";
import { getDb } from "@/lib/providers";

const schema = z.object({
  dismiss: z.literal(true),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await parseBody(req, schema);
    const db = getDb();
    const now = new Date();
    await db
      .update(users)
      .set({ onboardingDismissedAt: now, updatedAt: now })
      .where(eq(users.id, user.id));
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "onboarding.dismissed",
      targetType: "user",
      targetId: user.id,
    });
    return Response.json({ ok: true });
  });
}
