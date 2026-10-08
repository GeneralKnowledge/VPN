import { and, eq } from "drizzle-orm";
import { devices, users, vpnAccounts, vpnConnections } from "@northstar/db";
import { z } from "zod";
import { requireAdmin, writeAudit } from "@/lib/auth";
import { HttpError, handle, parseBody } from "@/lib/http";
import { getDb, getEmailProvider, getVpnProvider } from "@/lib/providers";
import {
  formatProviderError,
  provisionVpnForUser,
  reactivateVpnForUser,
  reconcileVpnProvisioning,
  suspendVpnForUser,
} from "@/lib/services";
import { correlationId, newId } from "@/lib/utils";

const schema = z.object({
  userId: z.string(),
  action: z.enum([
    "provision",
    "reconcile",
    "suspend",
    "reactivate",
    "revoke_connection",
    "delete_account",
  ]),
  connectionId: z.string().optional(),
  confirm: z.boolean().optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { userId, action, connectionId, confirm } = await parseBody(req, schema);
    const db = getDb();
    const vpn = getVpnProvider();
    const email = getEmailProvider();
    const cid = correlationId();

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new HttpError(404, "Not found");
    const [account] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, userId)).limit(1);

    if (user.deletedAt) throw new HttpError(400, "This account has been deleted.");

    if (action === "provision") {
      try {
        // Admin may force-provision for support; customer paths still require billing.
        const row = await provisionVpnForUser(db, vpn, email, userId, cid, {
          bypassSubscriptionCheck: true,
        });
        return Response.json({ ok: true, account: row });
      } catch (err) {
        return Response.json(
          {
            ok: false,
            error: "Provisioning failed",
            diagnostic: JSON.parse(formatProviderError(err, "account.provision")),
          },
          { status: 502 },
        );
      }
    }

    if (action === "reconcile") {
      const result = await reconcileVpnProvisioning(db, vpn, email, cid, { userId });
      return Response.json({ ok: true, ...result });
    }

    if (action === "suspend") {
      if (!confirm) return Response.json({ error: "Confirmation required" }, { status: 400 });
      await suspendVpnForUser(db, vpn, userId, cid, admin.id);
      return Response.json({ ok: true });
    }

    if (action === "reactivate") {
      await reactivateVpnForUser(db, vpn, userId, cid, admin.id);
      return Response.json({ ok: true });
    }

    if (action === "revoke_connection") {
      if (!connectionId) return Response.json({ error: "connectionId required" }, { status: 400 });
      const [conn] = await db
        .select()
        .from(vpnConnections)
        .where(and(eq(vpnConnections.id, connectionId), eq(vpnConnections.userId, userId)))
        .limit(1);
      if (!conn) return Response.json({ error: "Connection not found" }, { status: 404 });
      await db
        .update(vpnConnections)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(vpnConnections.id, conn.id));
      await writeAudit(db, {
        actorId: admin.id,
        actorType: "admin",
        action: "connection.revoked",
        targetType: "vpn_connection",
        targetId: conn.id,
        correlationId: cid,
      });
      return Response.json({ ok: true });
    }

    if (action === "delete_account") {
      if (!confirm) return Response.json({ error: "Confirmation required" }, { status: 400 });
      if (account && !account.providerAccountId.startsWith("pending_")) {
        try {
          await vpn.deleteAccount(account.providerAccountId);
        } catch (err) {
          return Response.json(
            {
              ok: false,
              error: "Provider delete failed",
              diagnostic: JSON.parse(formatProviderError(err, "account.delete")),
            },
            { status: 502 },
          );
        }
      }
      if (account) {
        await db
          .update(vpnAccounts)
          .set({
            status: "expired",
            providerAccountId: `deleted_${account.id}_${newId("x").slice(0, 6)}`,
            updatedAt: new Date(),
          })
          .where(eq(vpnAccounts.id, account.id));
        const conns = await db.select().from(vpnConnections).where(eq(vpnConnections.userId, userId));
        for (const c of conns) {
          await db
            .update(vpnConnections)
            .set({ revokedAt: new Date(), updatedAt: new Date() })
            .where(eq(vpnConnections.id, c.id));
        }
        const devs = await db.select().from(devices).where(eq(devices.userId, userId));
        for (const d of devs) {
          await db
            .update(devices)
            .set({ revokedAt: new Date(), updatedAt: new Date() })
            .where(eq(devices.id, d.id));
        }
      }
      await writeAudit(db, {
        actorId: admin.id,
        actorType: "admin",
        action: "vpn.account_deleted",
        targetType: "user",
        targetId: userId,
        correlationId: cid,
      });
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  }, { audience: "admin" });
}
