import { users } from "@northstar/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { adminErrorResponse } from "@/lib/http";
import { getDb, getVpnProvider } from "@/lib/providers";
import { suspendVpnForUser } from "@/lib/services";
import { correlationId } from "@/lib/utils";

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = z.object({ userId: z.string() }).safeParse(await req.json());
    if (!body.success) return Response.json({ error: "Invalid" }, { status: 400 });
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, body.data.userId)).limit(1);
    if (!user) return Response.json({ error: "Not found" }, { status: 404 });
    await suspendVpnForUser(db, getVpnProvider(), user.id, correlationId(), admin.id);
    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
