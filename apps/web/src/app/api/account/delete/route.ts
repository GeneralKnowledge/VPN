import { eq } from "drizzle-orm";
import { users, vpnAccounts } from "@northstar/db";
import { cookies } from "next/headers";
import { SESSION_COOKIE, destroySession, requireUser, writeAudit } from "@/lib/auth";
import { getDb, getVpnProvider } from "@/lib/providers";

export async function POST() {
  const user = await requireUser();
  const db = getDb();
  const [vpn] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, user.id)).limit(1);
  if (vpn?.providerAccountId && !vpn.providerAccountId.startsWith("pending_")) {
    try {
      await getVpnProvider().deleteAccount(vpn.providerAccountId);
    } catch {
      // continue soft-delete even if provider fails — reconcile later
    }
  }
  await db
    .update(users)
    .set({ deletedAt: new Date(), email: `deleted+${user.id}@invalid.local`, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await writeAudit(db, {
    actorId: user.id,
    actorType: "user",
    action: "account.deleted",
    targetType: "user",
    targetId: user.id,
  });
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (sessionId) await destroySession(db, sessionId);
  jar.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
