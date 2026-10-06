import { brand } from "@northstar/config";
import { requireAdmin } from "@/lib/auth";
import { getEnv } from "@/lib/providers";
import { Card } from "@/components/ui";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const env = getEnv();
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Settings</h1>
      <Card className="space-y-2 text-sm">
        <p><span className="text-muted">Brand:</span> {brand.name}</p>
        <p><span className="text-muted">APP_ENV:</span> {env.APP_ENV}</p>
        <p><span className="text-muted">VPN_PROVIDER:</span> {env.VPN_PROVIDER}</p>
        <p><span className="text-muted">BILLING_PROVIDER:</span> {env.BILLING_PROVIDER}</p>
        <p><span className="text-muted">EMAIL_PROVIDER:</span> {env.EMAIL_PROVIDER}</p>
        <p><span className="text-muted">ANALYTICS_PROVIDER:</span> {env.ANALYTICS_PROVIDER}</p>
        <p className="pt-2 text-muted">Change providers via environment variables — no redesign required.</p>
      </Card>
    </div>
  );
}
