"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { safeJson } from "@/lib/client";

function flagEmoji(countryCode: string): string {
  const code = countryCode.toUpperCase();
  if (code.length !== 2) return "🌐";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + code.charCodeAt(0) - 65, A + code.charCodeAt(1) - 65);
}

export function QuickConnect({
  locations,
}: {
  locations: Array<{ id: string; city: string; country: string; countryCode?: string }>;
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
    const created = await safeJson(create);
    if (!create.ok) {
      setStatus(created.error ?? "We couldn’t create your VPN connection. Please try again.");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/vpn/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: created.id, protocol: "wireguard" }),
    });
    if (!res.ok) {
      setStatus("We couldn’t download your configuration. Please try again.");
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
    const isMock = res.headers.get("X-Northstar-Mock-Config") === "true";
    setStatus(
      isMock
        ? "Configuration downloaded (development mock — not for production use)."
        : "Configuration downloaded. Import it into WireGuard to connect.",
    );
    setLoading(false);
  }

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="mb-1.5 block text-sm font-medium">Choose a location</label>
        <select
          className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {flagEmoji(l.countryCode ?? "")} {l.country} — {l.city}
            </option>
          ))}
        </select>
      </div>
      <Button type="button" onClick={connect} disabled={loading || !locationId}>
        {loading ? "Preparing…" : "Connect"}
      </Button>
      {status ? <p className="w-full text-sm text-muted">{status}</p> : null}
    </div>
  );
}
