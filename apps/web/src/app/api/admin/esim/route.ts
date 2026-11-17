import { esimOrders } from "@northstar/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin, writeAudit } from "@/lib/auth";
import { issueEsimForOrder, refundEsimOrder } from "@/lib/esim-services";
import { HttpError, handle, parseBody } from "@/lib/http";
import { getDb, getEmailProvider, getEsimProvider, getOneTimePayments } from "@/lib/providers";
import { correlationId } from "@/lib/utils";

const schema = z.object({
  orderId: z.string().min(1),
  /**
   * retry: issue again. For a needs_review order the admin confirms first that the provider panel
   * shows no eSIM for it, because a retry would otherwise buy a second one.
   * refund: refund the customer in full.
   */
  action: z.enum(["retry", "refund"]),
});

export async function POST(req: Request) {
  return handle(
    async () => {
      const admin = await requireAdmin();
      const body = await parseBody(req, schema);
      const db = getDb();
      const corr = correlationId();
      const [order] = await db.select().from(esimOrders).where(eq(esimOrders.id, body.orderId)).limit(1);
      if (!order) throw new HttpError(404, "Order not found");

      await writeAudit(db, {
        actorId: admin.id,
        actorType: "admin",
        action: `esim.admin.${body.action}`,
        targetType: "esim_order",
        targetId: order.id,
        correlationId: corr,
        metadata: { fromStatus: order.status },
      });

      if (body.action === "refund") {
        const updated = await refundEsimOrder(
          db,
          getOneTimePayments(),
          getEmailProvider(),
          order.id,
          corr,
          `Refunded by admin from ${order.status}`,
        );
        return Response.json({ ok: true, status: updated.status });
      }

      if (order.status !== "needs_review" && order.status !== "failed") {
        throw new HttpError(400, `Only failed or needs_review orders can be retried (now ${order.status})`);
      }
      if (order.status === "needs_review") {
        await db
          .update(esimOrders)
          .set({ status: "failed", updatedAt: new Date() })
          .where(and(eq(esimOrders.id, order.id), eq(esimOrders.status, "needs_review")));
      }
      try {
        const result = await issueEsimForOrder(
          db,
          getEsimProvider(),
          getEmailProvider(),
          order.id,
          corr,
          getOneTimePayments(),
        );
        return Response.json({ ok: true, status: result.order.status });
      } catch {
        const [after] = await db.select().from(esimOrders).where(eq(esimOrders.id, order.id)).limit(1);
        return Response.json({ ok: false, status: after?.status, error: after?.lastError }, { status: 502 });
      }
    },
    { audience: "admin" },
  );
}
