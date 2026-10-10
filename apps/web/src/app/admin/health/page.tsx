import { requireAdmin } from "@/lib/auth";
import { checkDatabase, getProviderStatuses } from "@/lib/health";
import { getEnv } from "@/lib/providers";
import { Badge, Card } from "@/components/ui";

export default async function AdminHealthPage() {
  await requireAdmin();
  const env = getEnv();
  const database = await checkDatabase();
  const { vpn, esim, billing, email } = await getProviderStatuses({ fresh: true });

  const rows = [
    { name: "Application", ok: true, detail: env.APP_ENV },
    { name: "Database", ok: database.ok, detail: database.detail ?? "reachable" },
    { name: "VPN Provider", ok: vpn.ok, detail: `${vpn.provider}${vpn.detail ? ` — ${vpn.detail}` : ""}` },
    { name: "eSIM Provider", ok: esim.ok, detail: `${esim.provider}${esim.detail ? ` — ${esim.detail}` : ""}` },
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
