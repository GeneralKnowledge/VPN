import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { supportMessages, supportTickets } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { SupportForm } from "./support-form";

const statusLabel: Record<string, string> = {
  open: "Open",
  pending: "Pending",
  resolved: "Resolved",
  closed: "Closed",
};

export default async function SupportDashPage() {
  const user = await requireUser();
  const db = getDb();
  const tickets = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.userId, user.id))
    .orderBy(desc(supportTickets.createdAt));

  const withMessages = await Promise.all(
    tickets.map(async (t) => ({
      ...t,
      messages: await db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.ticketId, t.id))
        .orderBy(supportMessages.createdAt),
    })),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        description="Try the setup guides first — open a ticket here if you still need help."
        actions={
          <Link href="/download">
            <Button size="sm" variant="secondary">
              Setup guides
            </Button>
          </Link>
        }
      />
      <SupportForm />
      <div className="space-y-4">
        {withMessages.length === 0 ? (
          <EmptyState
            title="No tickets yet"
            description="When you open a ticket, the conversation appears here."
          />
        ) : null}
        {withMessages.map((t) => (
          <Card key={t.id}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium">{t.subject}</h2>
              <Badge>{statusLabel[t.status] ?? t.status}</Badge>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {t.messages.map((m) => (
                <li key={m.id}>
                  <span className="font-medium text-foreground">{m.isStaff ? "Support" : "You"}:</span>{" "}
                  {m.body}
                </li>
              ))}
            </ul>
            <SupportForm ticketId={t.id} />
          </Card>
        ))}
      </div>
    </div>
  );
}
