import { and, eq, isNull } from "drizzle-orm";
import { devices, plans, subscriptions } from "@northstar/db";
import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { newId } from "@/lib/utils";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  platform: z.enum(["windows", "macos", "linux", "ios", "android", "other"]),
});

export async function GET() {
  try {
    const user = await requireUser();
    const db = getDb();
    const rows = await db
      .select()
      .from(devices)
      .where(and(eq(devices.userId, user.id), isNull(devices.revokedAt)));
    return Response.json({ devices: rows });
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = createSchema.safeParse(await req.json());
    if (!body.success) return Response.json({ error: "Invalid input" }, { status: 400 });
    const db = getDb();

    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    const active = subs.find((s) => s.status === "active" || s.status === "trialing" || s.status === "cancelling");
    const plan = active
      ? (await db.select().from(plans).where(eq(plans.id, active.planId)).limit(1))[0]
      : null;
    const maxDevices = plan?.maxDevices ?? 5;
    const current = await db
      .select()
      .from(devices)
      .where(and(eq(devices.userId, user.id), isNull(devices.revokedAt)));
    if (current.length >= maxDevices) {
      return Response.json({ error: `Device limit reached (${maxDevices})` }, { status: 400 });
    }

    const id = newId("dev");
    await db.insert(devices).values({
      id,
      userId: user.id,
      name: body.data.name,
      platform: body.data.platform,
      lastUsedAt: new Date(),
    });
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "device.created",
      targetType: "device",
      targetId: id,
    });
    return Response.json({ id });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = z
      .object({ id: z.string(), name: z.string().min(1).max(80) })
      .safeParse(await req.json());
    if (!body.success) return Response.json({ error: "Invalid input" }, { status: 400 });
    const db = getDb();
    const row = (await db.select().from(devices).where(eq(devices.id, body.data.id)).limit(1))[0];
    if (!row || row.userId !== user.id) return Response.json({ error: "Not found" }, { status: 404 });
    await db.update(devices).set({ name: body.data.name, updatedAt: new Date() }).where(eq(devices.id, row.id));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
    const db = getDb();
    const row = (await db.select().from(devices).where(eq(devices.id, id)).limit(1))[0];
    if (!row || row.userId !== user.id) return Response.json({ error: "Not found" }, { status: 404 });
    await db.update(devices).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(devices.id, id));
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "device.revoked",
      targetType: "device",
      targetId: id,
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
}
