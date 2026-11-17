import { requireAdmin } from "@/lib/auth";
import { reconcileEsimOrders } from "@/lib/esim-services";
import { HttpError, handle } from "@/lib/http";
import { getDb, getEmailProvider, getEnv, getEsimProvider, getVpnProvider } from "@/lib/providers";
import { reconcileVpnProvisioning } from "@/lib/services";
import { secretsMatch } from "@/lib/secrets";
import { correlationId } from "@/lib/utils";

function hasCronSecret(req: Request): boolean {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  return secretsMatch(bearer, getEnv().CRON_SECRET);
}

async function authorizeReconcile(req: Request): Promise<void> {
  if (hasCronSecret(req)) return;
  await requireAdmin();
}

async function run(options: { userId?: string; syncLocations?: boolean }) {
  const env = getEnv();
  const corr = correlationId();
  const vpn = await reconcileVpnProvisioning(getDb(), getVpnProvider(), getEmailProvider(), corr, {
    userId: options.userId,
    syncLocations: options.syncLocations ?? true,
    preferLiveLocations: env.VPN_PROVIDER === "vpnresellers",
  });
  const esim = await reconcileEsimOrders(getDb(), getEsimProvider(), getEmailProvider(), corr, {
    userId: options.userId,
  });
  return Response.json({ vpn, esim });
}

/** Admin or cron-triggered reconciliation: expire lapsed subscriptions, repair VPN accounts, sync status. */
export async function POST(req: Request) {
  return handle(
    async () => {
      await authorizeReconcile(req);
      const body = (await req.json().catch(() => ({}))) as { userId?: unknown; syncLocations?: unknown };
      if (body.userId !== undefined && typeof body.userId !== "string") {
        throw new HttpError(400, "Invalid userId");
      }
      return run({ userId: body.userId, syncLocations: body.syncLocations !== false });
    },
    { audience: "admin" },
  );
}

/**
 * Same as POST so schedulers that can only issue GET (e.g. Vercel Cron) can drive reconciliation.
 * Bearer token only: a session cookie rides along on any link an admin opens, so a state-changing
 * GET must not accept it.
 */
export async function GET(req: Request) {
  return handle(
    async () => {
      if (!hasCronSecret(req)) throw new HttpError(401, "Bearer token required");
      return run({});
    },
    { audience: "admin" },
  );
}
