"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui";
import { safeJson } from "@/lib/client";

export function ConnectionActions({
  connectionId,
  deviceId,
  name,
}: {
  connectionId: string;
  deviceId?: string | null;
  name: string;
}) {
  const router = useRouter();
  const { confirm, prompt, toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  async function rename() {
    if (!deviceId) {
      toast("Couldn’t find that device to rename", "danger");
      return;
    }
    const next = await prompt({
      title: "Rename device",
      label: "Device name",
      defaultValue: name,
      confirmLabel: "Rename",
    });
    if (!next || next === name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deviceId, name: next }),
      });
      if (!res.ok) toast((await safeJson(res)).error ?? "Rename failed", "danger");
      else toast("Device renamed", "success");
    } catch {
      toast("Network error. Please try again.", "danger");
    }
    setBusy(false);
    router.refresh();
  }

  async function revoke() {
    const ok = await confirm({
      title: `Remove ${name}?`,
      description: "This device will stop working and its configuration will be revoked. You can add it again later.",
      confirmLabel: "Remove device",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/vpn/connections?id=${encodeURIComponent(connectionId)}`, { method: "DELETE" });
      if (!res.ok) toast((await safeJson(res)).error ?? "Couldn’t remove the device", "danger");
      else toast("Device removed", "success");
    } catch {
      toast("Network error. Please try again.", "danger");
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" type="button" disabled={busy} onClick={rename}>
        Rename
      </Button>
      <Button size="sm" variant="danger" type="button" disabled={busy} onClick={revoke}>
        Remove
      </Button>
    </div>
  );
}
