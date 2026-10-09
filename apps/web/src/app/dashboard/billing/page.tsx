import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { formatPrice, getPlan, plans } from "@northstar/config";
import { invoices, subscriptions } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { getDb, isProduction } from "@/lib/providers";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { invoiceStatus, subscriptionStatus } from "@/lib/labels";
import { BillingActions } from "./billing-actions";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; checkout?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const db = getDb();
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const plan = sub ? getPlan(sub.planId) : undefined;
  const inv = await db.select().from(invoices).where(eq(invoices.userId, user.id)).orderBy(desc(invoices.createdAt)).limit(10);

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="Manage your plan, payment status and invoices." />
      {params.checkout === "cancel" ? <Alert>Checkout cancelled. You have not been charged.</Alert> : null}
      {sub?.status === "past_due" ? (
        <Alert tone="danger" title="We couldn’t take your last payment">
          Update your payment method soon to keep your VPN access. Access may be paused if the payment isn’t resolved.
        </Alert>
      ) : null}
      {sub?.status === "cancelling" ? (
        <Alert tone="warning" title="Your subscription is set to end">
          You keep full access until {formatDate(sub.currentPeriodEnd)}. Resume any time before then to keep your plan.
        </Alert>
      ) : null}
      {sub?.status === "trialing" ? (
        <Alert tone="info" title="You’re on a trial">
          {sub.currentPeriodEnd ? `Your trial ends on ${formatDate(sub.currentPeriodEnd)}.` : "Enjoy full access during your trial."}
        </Alert>
      ) : null}
      <Card>
        <p className="text-sm text-muted">Current subscription</p>
        {sub && plan ? (
          <>
            <p className="mt-2 font-display text-2xl">{plan.name}</p>
            <p className="text-sm text-muted">
              {formatPrice(plan)} · <Badge tone={subscriptionStatus(sub.status).tone}>{subscriptionStatus(sub.status).label}</Badge>
            </p>
            {sub.currentPeriodEnd && sub.status === "active" ? (
              <p className="mt-1 text-sm text-muted">Renews on {formatDate(sub.currentPeriodEnd)}</p>
            ) : null}
            <BillingActions status={sub.status} />
          </>
        ) : (
          <p className="mt-2 text-muted">No active subscription.</p>
        )}
      </Card>

      {!sub || sub.status === "cancelled" || sub.status === "expired" ? (
        <Card>
          <h2 className="font-display text-xl">Choose a plan</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {plans.filter((p) => p.active).map((p) => (
              <div key={p.id} className="rounded-lg border border-border p-4">
                <p className="font-medium">{p.name}</p>
                <p className="font-display text-2xl">{formatPrice(p)}</p>
                <BillingActions planId={p.id} prefer={params.plan === p.id} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="font-display text-lg">Invoices</h2>
        {inv.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No invoices yet" description="Invoices appear here after your first payment." />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {inv.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{formatMoney(i.amount, i.currency)}</span>
                  <span className="ml-2 text-muted">{formatDate(i.createdAt)}</span>
                </span>
                <span className="flex items-center gap-3">
                  {i.pdfUrl ? (
                    <a href={i.pdfUrl} className="text-sea hover:underline" rel="noopener noreferrer" target="_blank">
                      PDF
                    </a>
                  ) : null}
                  <Badge tone={invoiceStatus(i.status).tone}>{invoiceStatus(i.status).label}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {!isProduction() ? (
        <p className="text-sm text-muted">Development: checkout is simulated while the mock billing provider is active.</p>
      ) : null}
      <Link href="/pricing" className="text-sm text-sea hover:underline">
        View public pricing
      </Link>
    </div>
  );
}
