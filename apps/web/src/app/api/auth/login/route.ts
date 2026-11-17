import { cookies } from "next/headers";
import { createSession, setSessionCookie, writeAudit } from "@/lib/auth";
import { handle, parseBody } from "@/lib/http";
import { loginSchema, verifyLogin } from "@/lib/login";
import { getDb, track } from "@/lib/providers";
import { correlationId } from "@/lib/utils";

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, loginSchema);
    const db = getDb();
    const { user, ip } = await verifyLogin(db, req, body);

    const token = await createSession(db, user.id, {
      userAgent: req.headers.get("user-agent"),
      ipAddress: ip,
    });
    setSessionCookie(await cookies(), token);

    await writeAudit(db, {
      actorId: user.id,
      actorType: user.role === "admin" ? "admin" : "user",
      action: "auth.login",
      targetType: "user",
      targetId: user.id,
      correlationId: correlationId(),
    });

    track({ name: "login_completed", userId: user.id });
    return Response.json({ ok: true, redirectTo: user.role === "admin" ? "/admin" : "/dashboard" });
  });
}
