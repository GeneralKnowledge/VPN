import { and, eq, isNull } from "drizzle-orm";
import { devices, vpnConnections } from "@northstar/db";
import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { HttpError, handle, parseBody } from "@/lib/http";
import { getDb } from "@/lib/providers";
import { assertDeviceCapacity } from "@/lib/services";
import { newId } from "@/lib/utils";

const platform = z.enum(["windows", "macos", "linux", "ios", "android", "other"]);
const createSchema = z.object({ name: z.string().trim().min(1).max(80), platform });
const renameSchema = z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(80) });

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await getDb()
      .select()
      .from(devices)
      .where(and(eq(devices.userId, user.id), isNull(devices.revokedAt)));
    return Response.json({ devices: rows });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await parseBody(req, createSchema);
    const db = getDb();
    await assertDeviceCapacity(db, user.id);

    const id = newId("dev");
    // Standalone device rows are uncommon — prefer creating via /api/vpn/connections
    // (named connection + device). Do not set lastUsedAt on create; that is reserved
    // for config download / real use so onboarding stays accurate.
    await db.insert(devices).values({
      id,
      userId: user.id,
      name: body.name,
      platform: body.platform,
    });
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "device.created",
      targetType: "device",
      targetId: id,
    });
    return Response.json({ id });
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await parseBody(req, renameSchema);
    const db = getDb();
    const [row] = await db.select().from(devices).where(eq(devices.id, body.id)).limit(1);
    if (!row || row.userId !== user.id || row.revokedAt) throw new HttpError(404, "Not found");
    const now = new Date();
    await db.update(devices).set({ name: body.name, updatedAt: now }).where(eq(devices.id, row.id));
    if (row.connectionId) {
      await db
        .update(vpnConnections)
        .set({ name: body.name, updatedAt: now })
        .where(and(eq(vpnConnections.id, row.connectionId), eq(vpnConnections.userId, user.id)));
    }
    return Response.json({ ok: true });
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "Missing id");
    const db = getDb();
    const [row] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
    if (!row || row.userId !== user.id) throw new HttpError(404, "Not found");
    const now = new Date();
    await db.update(devices).set({ revokedAt: now, updatedAt: now }).where(eq(devices.id, id));
    if (row.connectionId) {
      // Revoking a device also cuts the connection it was created with.
      await db
        .update(vpnConnections)
        .set({ revokedAt: now, updatedAt: now })
        .where(and(eq(vpnConnections.id, row.connectionId), eq(vpnConnections.userId, user.id)));
    }
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "device.revoked",
      targetType: "device",
      targetId: id,
    });
    return Response.json({ ok: true });
  });
}
