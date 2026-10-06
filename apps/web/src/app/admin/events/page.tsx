import { desc } from "drizzle-orm";
import { auditEvents, providerEvents, webhookEvents } from "@northstar/db";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { Card } from "@/components/ui";

export default async function AdminEventsPage() {
  await requireAdmin();
  const db = getDb();
  const audits = await db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(40);
  const webhooks = await db.select().from(webhookEvents).orderBy(desc(webhookEvents.createdAt)).limit(20);
  const providers = await db.select().from(providerEvents).orderBy(desc(providerEvents.createdAt)).limit(20);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Events</h1>
      <Card>
        <h2 className="font-display text-lg">Audit</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {audits.map((a) => (
            <li key={a.id}>{a.action} · {a.actorType}</li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="font-display text-lg">Webhooks</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {webhooks.length === 0 ? <li className="text-muted">None yet</li> : null}
          {webhooks.map((w) => (
            <li key={w.id}>{w.provider} · {w.eventType}</li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="font-display text-lg">Provider events</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {providers.map((p) => (
            <li key={p.id}>{p.action} · {p.status}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
