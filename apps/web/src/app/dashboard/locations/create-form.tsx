"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Label } from "@/components/ui";

export function CreateConnectionForm({
  locations,
}: {
  locations: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const res = await fetch("/api/vpn/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationId: fd.get("locationId"),
            name: fd.get("name"),
            protocol: fd.get("protocol"),
            platform: fd.get("platform"),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed");
          return;
        }
        router.push("/dashboard/vpn");
        router.refresh();
      }}
    >
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required placeholder="Laptop" />
      </div>
      <div>
        <Label htmlFor="locationId">Location</Label>
        <select id="locationId" name="locationId" className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm" required>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="protocol">Protocol</Label>
        <select id="protocol" name="protocol" className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm" defaultValue="wireguard">
          <option value="wireguard">WireGuard</option>
          <option value="openvpn">OpenVPN</option>
        </select>
      </div>
      <div className="flex items-end">
        <input type="hidden" name="platform" value="other" />
        <Button type="submit" className="w-full">
          Add connection
        </Button>
      </div>
      {error ? <p className="text-sm text-danger sm:col-span-4">{error}</p> : null}
    </form>
  );
}
