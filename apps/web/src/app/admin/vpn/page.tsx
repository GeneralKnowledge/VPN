import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { vpnAccounts } from "@northstar/db";
import { desc } from "drizzle-orm";
import { Badge, Card } from "@/components/ui";

export default async function AdminVpnPage() {
  await requireAdmin();
  const rows = await getDb().select().from(vpnAccounts).orderBy(desc(vpnAccounts.createdAt)).limit(100);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">VPN Accounts</h1>
      <div className="space-y-2">
        {rows.map((v) => (
          <Card key={v.id} className="flex justify-between text-sm">
            <span>{v.username}</span>
            <Badge tone={v.status === "active" ? "success" : "warning"}>{v.status}</Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}
