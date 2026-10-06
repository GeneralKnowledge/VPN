"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function QuickConnect({
  locations,
}: {
  locations: Array<{ id: string; city: string; country: string }>;
}) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function connect() {
    if (!locationId) return;
    setLoading(true);
    setStatus(null);
    const loc = locations.find((l) => l.id === locationId);
    const create = await fetch("/api/vpn/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationId,
        protocol: "wireguard",
        name: `${loc?.city ?? "VPN"} device`,
        platform: "other",
      }),
    });
    const created = await create.json();
    if (!create.ok) {
      setStatus(created.error ?? "Failed");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/vpn/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: created.id, protocol: "wireguard" }),
    });
    if (!res.ok) {
      setStatus("Could not download configuration");
      setLoading(false);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replaceAll('"', "") ?? "northstar.conf";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Mock configuration downloaded — not for production use.");
    setLoading(false);
  }

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="mb-1.5 block text-sm font-medium">Choose location</label>
        <select
          className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.city}, {l.country}
            </option>
          ))}
        </select>
      </div>
      <Button type="button" onClick={connect} disabled={loading || !locationId}>
        {loading ? "Preparing…" : "Connect & download"}
      </Button>
      {status ? <p className="w-full text-sm text-muted">{status}</p> : null}
    </div>
  );
}
