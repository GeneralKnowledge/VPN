import { checkDatabase, getProviderStatuses } from "@/lib/health";

/** Lightweight health for uptime checks — no secrets, no per-request upstream calls. */
export async function GET() {
  const [database, { vpn, esim, billing, email }] = await Promise.all([
    checkDatabase(),
    getProviderStatuses(),
  ]);
  const ok = database.ok && vpn.ok && esim.ok && billing.ok && email.ok;
  return Response.json(
    {
      status: ok ? "operational" : "degraded",
      checks: {
        application: "operational",
        database: database.ok ? "operational" : "degraded",
        vpn: vpn.ok ? "operational" : "degraded",
        esim: esim.ok ? "operational" : "degraded",
        billing: billing.ok ? "operational" : "degraded",
        email: email.ok ? "operational" : "degraded",
      },
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
