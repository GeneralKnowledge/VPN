import { eq } from "drizzle-orm";
import { users, vpnAccounts } from "@northstar/db";
import { z } from "zod";
import { requireAdmin, writeAudit } from "@/lib/auth";
import { getDb, getVpnProvider } from "@/lib/providers";
import { correlationId } from "@/lib/utils";

export async function POST(req: Request) {
  const admin = await requireAdmin();
  const body = z.object({ userId: z.string() }).safeParse(await req.json());
  if (!body.success) return Response.json({ error: "Invalid" }, { status: 400 });
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, body.data.userId)).limit(1);
  if (!user) return Response.json({ error: "Not found" }, { status: 404 });
  const [vpn] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, user.id)).limit(1);
  if (vpn && !vpn.providerAccountId.startsWith("pending_")) {
    try {
      await getVpnProvider().suspendAccount(vpn.providerAccountId);
    } catch {
      // still mark locally
    }
    await db
      .update(vpnAccounts)
      .set({ status: "disabled", updatedAt: new Date() })
      .where(eq(vpnAccounts.id, vpn.id));
  }
  await db.update(users).set({ lifecycle: "suspended", updatedAt: new Date() }).where(eq(users.id, user.id));
  await writeAudit(db, {
    actorId: admin.id,
    actorType: "admin",
    action: "account.suspended",
    targetType: "user",
    targetId: user.id,
    correlationId: correlationId(),
  });
  return Response.json({ ok: true });
}
