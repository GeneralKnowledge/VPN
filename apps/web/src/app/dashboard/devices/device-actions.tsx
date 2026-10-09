"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useFeedback } from "@/components/feedback";
import { Button, Input, Label, Select } from "@/components/ui";
import { safeJson } from "@/lib/client";

export function DeviceActions({ deviceId, name }: { deviceId?: string; name?: string }) {
  const router = useRouter();
  const { confirm, prompt, toast } = useFeedback();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function rename() {
    if (!deviceId) return;
    const next = await prompt({ title: "Rename device", label: "Device name", defaultValue: name, confirmLabel: "Rename" });
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
    if (!deviceId) return;
    const ok = await confirm({
      title: `Remove ${name ?? "this device"}?`,
      description: "It will stop working and its configuration will be revoked. You can add it again later.",
      confirmLabel: "Remove device",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/devices?id=${encodeURIComponent(deviceId)}`, { method: "DELETE" });
      if (!res.ok) toast((await safeJson(res)).error ?? "Couldn’t remove the device", "danger");
      else toast("Device removed", "success");
    } catch {
      toast("Network error. Please try again.", "danger");
    }
    setBusy(false);
    router.refresh();
  }

  async function addDevice(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fd.get("name"), platform: fd.get("platform") }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error ?? "We couldn’t add that device. Please try again.");
      } else {
        formEl.reset();
        toast("Device added", "success");
        router.refresh();
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setBusy(false);
  }

  if (deviceId) {
    return (
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" type="button" disabled={busy} onClick={rename}>
          Rename
        </Button>
        <Button size="sm" variant="danger" type="button" disabled={busy} onClick={revoke}>
          Remove
        </Button>
      </div>
    );
  }

  return (
    <form className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-3" onSubmit={addDevice}>
      <div>
        <Label htmlFor="name">Add device</Label>
        <Input id="name" name="name" required maxLength={80} placeholder="iPhone" />
      </div>
      <div>
        <Label htmlFor="platform">Platform</Label>
        <Select id="platform" name="platform" defaultValue="ios">
          <option value="ios">iOS</option>
          <option value="android">Android</option>
          <option value="windows">Windows</option>
          <option value="macos">macOS</option>
          <option value="linux">Linux</option>
          <option value="other">Other</option>
        </Select>
      </div>
      <div className="flex items-end">
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Adding…" : "Add device"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger sm:col-span-3">
          {error}
        </p>
      ) : null}
    </form>
  );
}
