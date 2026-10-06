import { AuthError, requireAdmin } from "@/lib/auth";
import { getDb, getEmailProvider, getEnv, getVpnProvider } from "@/lib/providers";
import { reconcileVpnProvisioning } from "@/lib/services";
import { correlationId } from "@/lib/utils";

function authorizeReconcile(req: Request): Promise<"admin" | "cron"> {
  const env = getEnv();
  const auth = req.headers.get("authorization");
  if (env.CRON_SECRET && auth === `Bearer ${env.CRON_SECRET}`) {
    return Promise.resolve("cron");
  }
  return requireAdmin().then(() => "admin" as const);
}

/** Admin or cron-triggered reconciliation of paid users missing VPN + status sync. */
export async function POST(req: Request) {
  try {
    await authorizeReconcile(req);
    const env = getEnv();
    const body = (await req.json().catch(() => ({}))) as {
      userId?: string;
      syncLocations?: boolean;
    };
    const result = await reconcileVpnProvisioning(
      getDb(),
      getVpnProvider(),
      getEmailProvider(),
      correlationId(),
      {
        userId: body.userId,
        syncLocations: body.syncLocations ?? true,
        preferLiveLocations: env.VPN_PROVIDER === "vpnresellers",
      },
    );
    return Response.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Failed" }, { status: 401 });
  }
}
