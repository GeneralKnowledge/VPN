"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function AdminCustomerActions({
  userId,
  vpnStatus,
}: {
  userId: string;
  vpnStatus?: string;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="danger"
        type="button"
        onClick={async () => {
          if (!confirm("Suspend this customer VPN account?")) return;
          await fetch("/api/admin/suspend", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          });
          router.refresh();
        }}
      >
        Suspend
      </Button>
      <Button
        type="button"
        onClick={async () => {
          if (!confirm("Restore this customer VPN account?")) return;
          await fetch("/api/admin/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          });
          router.refresh();
        }}
      >
        Restore
      </Button>
      <span className="self-center text-sm text-muted">VPN: {vpnStatus ?? "none"}</span>
    </div>
  );
}
