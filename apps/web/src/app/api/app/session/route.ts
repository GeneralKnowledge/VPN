import { createSession, currentSessionToken, destroySession, getSessionUser, writeAudit, SESSION_LIFETIME_MS } from "@/lib/auth";
import { HttpError, handle, parseBody } from "@/lib/http";
import { loginSchema, verifyLogin } from "@/lib/login";
import { getDb, track } from "@/lib/providers";
import { correlationId } from "@/lib/utils";

/**
 * Sign-in for the native app. Same checks and rate limits as the website, but the session token
 * comes back in the body instead of a cookie; the app sends it as `Authorization: Bearer <token>`
 * on every other API call. The session shows up in the customer's session list like any other.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, loginSchema);
    const db = getDb();
    const { user, ip } = await verifyLogin(db, req, body);
    // Admin accounts stay on the website, where they get the admin pages and cookie protections.
    if (user.role === "admin") throw new HttpError(403, "Admin accounts sign in on the website.");

    const token = await createSession(db, user.id, {
      userAgent: req.headers.get("user-agent") ?? "app",
      ipAddress: ip,
    });
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "auth.login",
      targetType: "user",
      targetId: user.id,
      correlationId: correlationId(),
      metadata: { client: "app" },
    });
    track({ name: "login_completed", userId: user.id, properties: { client: "app" } });
    return Response.json(
      {
        token,
        expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS).toISOString(),
        user: { username: user.username, email: user.email, name: user.name },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}

/** Sign the app out: the bearer token stops working at once. */
export async function DELETE() {
  return handle(async () => {
    const token = await currentSessionToken();
    const user = await getSessionUser();
    if (!token || !user) throw new HttpError(401, "Not authenticated");
    const db = getDb();
    await destroySession(db, token);
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "auth.logout",
      targetType: "user",
      targetId: user.id,
      metadata: { client: "app" },
    });
    return Response.json({ ok: true });
  });
}
