"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button, Label, Select } from "@/components/ui";
import { safeJson } from "@/lib/client";
import { flagEmoji } from "@/lib/format";

export function QuickConnect({
  locations,
  connections,
}: {
  locations: Array<{ id: string; city: string; country: string; countryCode?: string }>;
  connections: Array<{ id: string; locationId: string; protocol: string }>;
}) {
  const router = useRouter();
  const selectId = useId();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function connect() {
    if (!locationId) return;
    setLoading(true);
    setStatus(null);
    const loc = locations.find((l) => l.id === locationId);
    let connectionId = connections.find((c) => c.locationId === locationId && c.protocol === "wireguard")?.id;
    if (!connectionId) {
      const create = await fetch("/api/vpn/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          protocol: "wireguard",
          name: `${loc?.city ?? "VPN"} (WireGuard)`,
        }),
      });
      const created = await safeJson(create);
      if (!create.ok || !created.id) {
        setStatus(created.error ?? "We couldn’t create your VPN connection. Please try again.");
        setLoading(false);
        return;
      }
      connectionId = created.id;
    }
    const res = await fetch("/api/vpn/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, protocol: "wireguard" }),
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
    router.refresh();
  }

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Label htmlFor={selectId}>Choose a location</Label>
        <Select
          id={selectId}
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {flagEmoji(l.countryCode ?? "")} {l.country} — {l.city}
            </option>
          ))}
        </Select>
      </div>
      <Button type="button" onClick={connect} disabled={loading || !locationId}>
        {loading ? "Preparing…" : "Connect"}
      </Button>
      {status ? (
        <p className="w-full text-sm text-muted" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
