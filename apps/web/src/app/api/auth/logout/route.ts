import { cookies } from "next/headers";
import { SESSION_COOKIE, destroySession, getSessionUser, writeAudit } from "@/lib/auth";
import { getDb } from "@/lib/providers";

export async function POST() {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  const user = await getSessionUser();
  const db = getDb();
  if (sessionId) await destroySession(db, sessionId);
  jar.delete(SESSION_COOKIE);
  if (user) {
    await writeAudit(db, {
      actorId: user.id,
      actorType: user.role === "admin" ? "admin" : "user",
      action: "auth.logout",
      targetType: "user",
      targetId: user.id,
    });
  }
  return Response.json({ ok: true });
}
