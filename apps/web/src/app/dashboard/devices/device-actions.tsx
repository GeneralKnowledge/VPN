"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Label } from "@/components/ui";

export function DeviceActions({ deviceId, name }: { deviceId?: string; name?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  if (deviceId) {
    return (
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          type="button"
          onClick={async () => {
            const next = window.prompt("Rename device", name);
            if (!next) return;
            await fetch("/api/devices", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: deviceId, name: next }),
            });
            router.refresh();
          }}
        >
          Rename
        </Button>
        <Button
          size="sm"
          variant="danger"
          type="button"
          onClick={async () => {
            if (!window.confirm("Revoke this device?")) return;
            await fetch(`/api/devices?id=${deviceId}`, { method: "DELETE" });
            router.refresh();
          }}
        >
          Revoke
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const res = await fetch("/api/devices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fd.get("name"), platform: fd.get("platform") }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed");
          return;
        }
        router.refresh();
        e.currentTarget.reset();
      }}
    >
      <div>
        <Label htmlFor="name">Add device</Label>
        <Input id="name" name="name" required placeholder="iPhone" />
      </div>
      <div>
        <Label htmlFor="platform">Platform</Label>
        <select id="platform" name="platform" className="h-11 w-full rounded-md border border-border px-3 text-sm" defaultValue="ios">
          <option value="ios">iOS</option>
          <option value="android">Android</option>
          <option value="windows">Windows</option>
          <option value="macos">macOS</option>
          <option value="linux">Linux</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="flex items-end">
        <Button type="submit" className="w-full">
          Add device
        </Button>
      </div>
      {error ? <p className="text-sm text-danger sm:col-span-3">{error}</p> : null}
    </form>
  );
}
