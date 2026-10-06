import { requireAdmin } from "@/lib/auth";
import { getBillingProvider, getEmailProvider, getEnv, getVpnProvider } from "@/lib/providers";
import { createDb } from "@northstar/db";
import { Badge, Card } from "@/components/ui";

export default async function AdminHealthPage() {
  await requireAdmin();
  const env = getEnv();
  let database: { ok: boolean; detail?: string } = { ok: true };
  try {
    const { sqlite } = createDb(env.DATABASE_URL);
    sqlite.prepare("select 1").get();
    sqlite.close();
  } catch (err) {
    database = { ok: false, detail: err instanceof Error ? err.message : "error" };
  }
  const vpn = await getVpnProvider().getProviderStatus();
  const billing = await getBillingProvider().getProviderStatus();
  const email = await getEmailProvider().getProviderStatus();

  const rows = [
    { name: "Application", ok: true, detail: env.APP_ENV },
    { name: "Database", ok: database.ok, detail: database.detail ?? "reachable" },
    { name: "VPN Provider", ok: vpn.ok, detail: `${vpn.provider}${vpn.detail ? ` — ${vpn.detail}` : ""}` },
    { name: "Billing", ok: billing.ok, detail: `${billing.provider}${billing.detail ? ` — ${billing.detail}` : ""}` },
    { name: "Email", ok: email.ok, detail: `${email.provider}${email.detail ? ` — ${email.detail}` : ""}` },
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">System Health</h1>
      <p className="text-sm text-muted">Internal only — no secrets displayed.</p>
      <div className="space-y-2">
        {rows.map((r) => (
          <Card key={r.name} className="flex items-center justify-between">
            <div>
              <p className="font-medium">{r.name}</p>
              <p className="text-sm text-muted">{r.detail}</p>
            </div>
            <Badge tone={r.ok ? "success" : "danger"}>{r.ok ? "Operational" : "Degraded"}</Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}
