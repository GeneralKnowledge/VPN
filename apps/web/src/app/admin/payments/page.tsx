import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { payments } from "@northstar/db";
import { desc } from "drizzle-orm";
import { Badge, Card } from "@/components/ui";

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const rows = await getDb().select().from(payments).orderBy(desc(payments.createdAt)).limit(100);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Payments</h1>
      <div className="space-y-2">
        {rows.map((p) => (
          <Card key={p.id} className="flex justify-between text-sm">
            <span>£{(p.amount / 100).toFixed(2)} · {p.provider}</span>
            <Badge tone={p.status === "succeeded" ? "success" : "warning"}>{p.status}</Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}
