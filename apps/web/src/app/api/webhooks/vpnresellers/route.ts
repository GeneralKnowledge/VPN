import { eq } from "drizzle-orm";
import { webhookEvents } from "@northstar/db";
import { writeAudit } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { correlationId, newId } from "@/lib/utils";

/**
 * VPNresellers does not document public webhooks in API v4.1 docs we reviewed.
 * This endpoint exists for future provider callbacks / manual replay in mock mode.
 * Signature header: x-vpnresellers-signature (or x-northstar-signature in mock).
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-vpnresellers-signature") ?? req.headers.get("x-northstar-signature");
  const signatureValid =
    process.env.VPN_PROVIDER === "mock"
      ? signature === null || signature.startsWith("mock_") || signature === "dev"
      : Boolean(signature);

  let parsed: { id?: string; type?: string };
  try {
    parsed = JSON.parse(raw) as { id?: string; type?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = parsed.id ?? newId("vr_evt");
  const db = getDb();
  const existing = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.eventId, eventId))
    .limit(1);
  if (existing[0]?.processedAt) return Response.json({ ok: true, deduped: true });

  const rowId = existing[0]?.id ?? newId("wh");
  if (!existing[0]) {
    await db.insert(webhookEvents).values({
      id: rowId,
      provider: "vpnresellers",
      eventId,
      eventType: parsed.type ?? "unknown",
      payloadJson: raw,
      signatureValid,
    });
  }

  await writeAudit(db, {
    actorType: "webhook",
    action: "vpnresellers.event_received",
    targetType: "webhook_event",
    targetId: eventId,
    correlationId: correlationId(),
    metadata: { type: parsed.type ?? "unknown" },
  });

  await db
    .update(webhookEvents)
    .set({ processedAt: new Date(), updatedAt: new Date() })
    .where(eq(webhookEvents.id, rowId));

  return Response.json({ ok: true });
}
