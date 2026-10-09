import { desc } from "drizzle-orm";
import { auditEvents, providerEvents, webhookEvents } from "@northstar/db";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { activityLabel } from "@/lib/labels";
import { getDb } from "@/lib/providers";
import { DataTable } from "@/components/data-table";
import { Badge, PageHeader } from "@/components/ui";

export default async function AdminEventsPage() {
  await requireAdmin();
  const db = getDb();
  const audits = await db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(40);
  const webhooks = await db.select().from(webhookEvents).orderBy(desc(webhookEvents.createdAt)).limit(20);
  const providers = await db.select().from(providerEvents).orderBy(desc(providerEvents.createdAt)).limit(20);

  return (
    <div className="space-y-6">
      <PageHeader title="Events" description="Audit trail, inbound webhooks, and provider API activity." />

      <section className="space-y-3">
        <h2 className="font-display text-xl">Audit</h2>
        <DataTable
          caption="Audit events"
          emptyTitle="No audit events"
          rows={audits}
          rowKey={(a) => a.id}
          columns={[
            { key: "action", header: "Action", cell: (a) => activityLabel(a.action) },
            { key: "actor", header: "Actor", cell: (a) => a.actorType },
            {
              key: "target",
              header: "Target",
              className: "font-mono text-xs text-muted",
              cell: (a) => (a.targetId ? `${a.targetType} ${a.targetId.slice(0, 12)}…` : a.targetType ?? "—"),
            },
            {
              key: "when",
              header: "When",
              className: "whitespace-nowrap text-muted",
              cell: (a) => formatDateTime(a.createdAt),
            },
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Webhooks</h2>
        <DataTable
          caption="Webhook events"
          emptyTitle="No webhooks yet"
          rows={webhooks}
          rowKey={(w) => w.id}
          columns={[
            { key: "provider", header: "Provider", cell: (w) => w.provider },
            { key: "type", header: "Event", cell: (w) => w.eventType },
            {
              key: "sig",
              header: "Signature",
              cell: (w) => (
                <Badge tone={w.signatureValid ? "success" : "danger"}>
                  {w.signatureValid ? "Valid" : "Invalid"}
                </Badge>
              ),
            },
            {
              key: "when",
              header: "When",
              className: "whitespace-nowrap text-muted",
              cell: (w) => formatDateTime(w.createdAt),
            },
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Provider events</h2>
        <DataTable
          caption="Provider events"
          emptyTitle="No provider events"
          rows={providers}
          rowKey={(p) => p.id}
          columns={[
            { key: "action", header: "Action", cell: (p) => p.action },
            {
              key: "status",
              header: "Status",
              cell: (p) => (
                <Badge tone={p.status === "success" ? "success" : p.status === "error" ? "danger" : "warning"}>
                  {p.status}
                </Badge>
              ),
            },
            { key: "provider", header: "Provider", cell: (p) => p.provider },
            {
              key: "when",
              header: "When",
              className: "whitespace-nowrap text-muted",
              cell: (p) => formatDateTime(p.createdAt),
            },
          ]}
        />
      </section>
    </div>
  );
}
