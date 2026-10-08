import { requireAdmin } from "@/lib/auth";
import { HttpError, handle } from "@/lib/http";
import { getDb, getEmailProvider, getEnv, getVpnProvider } from "@/lib/providers";
import { reconcileVpnProvisioning } from "@/lib/services";
import { secretsMatch } from "@/lib/secrets";
import { correlationId } from "@/lib/utils";

async function authorizeReconcile(req: Request): Promise<void> {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (secretsMatch(bearer, getEnv().CRON_SECRET)) return;
  await requireAdmin();
}

async function run(options: { userId?: string; syncLocations?: boolean }) {
  const env = getEnv();
  const result = await reconcileVpnProvisioning(getDb(), getVpnProvider(), getEmailProvider(), correlationId(), {
    userId: options.userId,
    syncLocations: options.syncLocations ?? true,
    preferLiveLocations: env.VPN_PROVIDER === "vpnresellers",
  });
  return Response.json(result);
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

/** Same as POST so schedulers that can only issue GET (e.g. Vercel Cron) can drive reconciliation. */
export async function GET(req: Request) {
  return handle(
    async () => {
      await authorizeReconcile(req);
      return run({});
    },
    { audience: "admin" },
  );
}
