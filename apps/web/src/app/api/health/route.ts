import { getBillingProvider, getEmailProvider, getEnv, getVpnProvider } from "@/lib/providers";
import { createDb } from "@northstar/db";

/** Lightweight health for uptime checks — no secrets. */
export async function GET() {
  const env = getEnv();
  let dbOk = true;
  try {
    const { sqlite } = createDb(env.DATABASE_URL);
    sqlite.prepare("select 1").get();
    sqlite.close();
  } catch {
    dbOk = false;
  }
  const [vpn, billing, email] = await Promise.all([
    getVpnProvider().getProviderStatus(),
    getBillingProvider().getProviderStatus(),
    getEmailProvider().getProviderStatus(),
  ]);
  const ok = dbOk && vpn.ok && billing.ok && email.ok;
  return Response.json(
    {
      status: ok ? "operational" : "degraded",
      checks: {
        application: "operational",
        database: dbOk ? "operational" : "degraded",
        vpn: vpn.ok ? "operational" : "degraded",
        billing: billing.ok ? "operational" : "degraded",
        email: email.ok ? "operational" : "degraded",
      },
    },
    { status: ok ? 200 : 503 },
  );
}
