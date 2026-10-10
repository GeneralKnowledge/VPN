import Link from "next/link";
import { listUserEsimOrders } from "@/lib/esim-services";
import { formatMoney } from "@/lib/product";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, PageHeader } from "@/components/ui";

export default async function DashboardEsimPage() {
  const user = await requireUser();
  const rows = await listUserEsimOrders(getDb(), user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your eSIMs"
        description="One-time packages you’ve purchased. Scan the QR to install on a compatible phone."
        actions={
          <Link href="/pricing">
            <Button size="sm">Buy another</Button>
          </Link>
        }
      />

      {rows.length === 0 ? (
        <div className="border border-border bg-surface p-8 text-center">
          <p className="text-muted">No eSIM orders yet.</p>
          <Link href="/pricing" className="mt-4 inline-block">
            <Button>Browse plans</Button>
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map(({ order, profile }) => (
            <li key={order.id} className="border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl">{order.packageName}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {order.countryCode}
                    {order.dataVolume ? ` · ${order.dataVolume}` : ""}
                    {order.validity ? ` · ${order.validity}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {formatMoney(order.amount, order.currency)} · {formatDateTime(order.createdAt)}
                  </p>
                </div>
                <Badge
                  tone={
                    order.status === "issued"
                      ? "success"
                      : order.status === "failed"
                        ? "danger"
                        : order.status === "paid"
                          ? "warning"
                          : "neutral"
                  }
                >
                  {order.status}
                </Badge>
              </div>

              {order.status === "failed" ? (
                <p className="mt-3 text-sm text-danger">
                  Payment recorded but issuing failed. We’ll retry automatically; contact support if this persists.
                </p>
              ) : null}

              {profile ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-[140px_1fr]">
                  {profile.qrCodeUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.qrCodeUrl}
                      alt="eSIM QR code"
                      className="h-36 w-36 rounded border border-border bg-white object-contain p-2"
                    />
                  ) : (
                    <div className="flex h-36 w-36 items-center justify-center border border-dashed border-border text-xs text-muted">
                      QR pending
                    </div>
                  )}
                  <div className="space-y-2 text-sm">
                    {profile.iccid ? (
                      <p>
                        <span className="text-muted">ICCID</span>{" "}
                        <span className="font-mono">{profile.iccid}</span>
                      </p>
                    ) : null}
                    {profile.activationUrl ? (
                      <p className="break-all">
                        <span className="text-muted">Activation</span>{" "}
                        <span className="font-mono text-xs">{profile.activationUrl}</span>
                      </p>
                    ) : null}
                    <p className="text-muted">
                      On iPhone: Settings → Mobile → Add eSIM → Use QR Code. Keep Wi‑Fi on while installing.
                    </p>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
