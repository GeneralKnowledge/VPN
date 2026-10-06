import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { subscriptions } from "@northstar/db";
import { desc } from "drizzle-orm";
import { Badge, Card } from "@/components/ui";

export default async function AdminSubscriptionsPage() {
  await requireAdmin();
  const rows = await getDb().select().from(subscriptions).orderBy(desc(subscriptions.createdAt)).limit(100);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Subscriptions</h1>
      <div className="space-y-2">
        {rows.map((s) => (
          <Card key={s.id} className="flex justify-between text-sm">
            <span>{s.userId.slice(0, 18)}… · {s.planId}</span>
            <Badge>{s.status}</Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}
