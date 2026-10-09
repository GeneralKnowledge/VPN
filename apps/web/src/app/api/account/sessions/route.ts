import { and, eq, ne } from "drizzle-orm";
import { sessions } from "@northstar/db";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  currentSessionKey,
  destroyUserSessions,
  listUserSessions,
  requireUser,
  writeAudit,
} from "@/lib/auth";
import { HttpError, handle } from "@/lib/http";
import { getDb } from "@/lib/providers";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    const currentId = token ? currentSessionKey(token) : null;
    const rows = await listUserSessions(getDb(), user.id);
    return Response.json({
      sessions: rows
        .map((s) => ({
          id: s.id,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
          userAgent: s.userAgent,
          ipAddress: s.ipAddress,
          current: currentId != null && s.id === currentId,
        }))
        .sort((a, b) => {
          if (a.current !== b.current) return a.current ? -1 : 1;
          const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
          const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
          return bTime - aTime;
        }),
    });
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const others = url.searchParams.get("others") === "1" || url.searchParams.get("others") === "true";

    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (!token) throw new HttpError(401, "Not authenticated");
    const db = getDb();

    if (others) {
      await destroyUserSessions(db, user.id, token);
      await writeAudit(db, {
        actorId: user.id,
        actorType: "user",
        action: "session.revoked_others",
        targetType: "user",
        targetId: user.id,
      });
      return Response.json({ ok: true });
    }

    if (!id) throw new HttpError(400, "Missing session id");
    const currentId = currentSessionKey(token);
    if (id === currentId) {
      throw new HttpError(400, "You can’t sign out your current session here. Use Sign out instead.");
    }

    const deleted = await db
      .delete(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, user.id), ne(sessions.id, currentId)))
      .returning({ id: sessions.id });
    if (!deleted[0]) throw new HttpError(404, "Session not found");

    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "session.revoked",
      targetType: "session",
      targetId: id,
    });
    return Response.json({ ok: true });
  });
}
