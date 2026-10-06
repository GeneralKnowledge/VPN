import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { vpnConnections } from "@northstar/db";
import { desc } from "drizzle-orm";
import { Card } from "@/components/ui";

export default async function AdminConnectionsPage() {
  await requireAdmin();
  const rows = await getDb().select().from(vpnConnections).orderBy(desc(vpnConnections.createdAt)).limit(100);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Connections</h1>
      <div className="space-y-2">
        {rows.map((c) => (
          <Card key={c.id} className="text-sm">
            {c.name} · {c.protocol} · user {c.userId.slice(0, 12)}
            {c.revokedAt ? " · revoked" : ""}
          </Card>
        ))}
      </div>
    </div>
  );
}
