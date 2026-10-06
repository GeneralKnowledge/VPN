import { requireAdmin } from "@/lib/auth";
import { getDb, getEmailProvider, getVpnProvider } from "@/lib/providers";
import { reconcileVpnProvisioning } from "@/lib/services";
import { correlationId } from "@/lib/utils";

/** Admin-triggered reconciliation of paid users missing VPN. */
export async function POST() {
  try {
    await requireAdmin();
    const result = await reconcileVpnProvisioning(
      getDb(),
      getVpnProvider(),
      getEmailProvider(),
      correlationId(),
    );
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 401 });
  }
}
