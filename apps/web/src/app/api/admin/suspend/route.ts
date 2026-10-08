import { users } from "@northstar/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { HttpError, handle, parseBody } from "@/lib/http";
import { getDb, getVpnProvider } from "@/lib/providers";
import { suspendVpnForUser } from "@/lib/services";
import { correlationId } from "@/lib/utils";

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = { data: await parseBody(req, z.object({ userId: z.string().min(1) })) };
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, body.data.userId)).limit(1);
    if (!user || user.deletedAt) throw new HttpError(404, "Not found");
    await suspendVpnForUser(db, getVpnProvider(), user.id, correlationId(), admin.id);
    return Response.json({ ok: true });
  }, { audience: "admin" });
}
