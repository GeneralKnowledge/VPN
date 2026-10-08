"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { safeJson } from "@/lib/client";

export function CreateConnectionForm({
  locations,
}: {
  locations: Array<{ id: string; label: string; city: string; country: string; countryCode: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const fd = new FormData(e.currentTarget);
        const locationId = String(fd.get("locationId") ?? "");
        const loc = locations.find((l) => l.id === locationId);
        const res = await fetch("/api/vpn/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationId,
            name: fd.get("name") || `${loc?.city ?? "VPN"} device`,
            protocol: fd.get("protocol") || "wireguard",
            platform: fd.get("platform") || "other",
          }),
        });
        const data = await safeJson(res);
        if (!res.ok) {
          setError(data.error ?? "We couldn’t create your VPN connection. Please try again.");
          setLoading(false);
          return;
        }
        // Auto-download config
        const cfg = await fetch("/api/vpn/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId: data.id }),
        });
        if (!cfg.ok) {
          setError((await safeJson(cfg)).error ?? "Your connection was created but the configuration couldn’t be downloaded. Download it from Your VPN.");
          setLoading(false);
          router.refresh();
          return;
        }
        const blob = await cfg.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download =
          cfg.headers.get("Content-Disposition")?.split("filename=")[1]?.replaceAll('"', "") ??
          "northstar.conf";
        a.click();
        URL.revokeObjectURL(url);
        router.push("/dashboard/vpn");
        router.refresh();
      }}
    >
      <div>
        <Label htmlFor="name">Device name</Label>
        <Input id="name" name="name" placeholder="Laptop" />
      </div>
      <div>
        <Label htmlFor="locationId">Location</Label>
        <select
          id="locationId"
          name="locationId"
          className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
          required
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="protocol">Protocol</Label>
        <select
          id="protocol"
          name="protocol"
          className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
          defaultValue="wireguard"
        >
          <option value="wireguard">WireGuard</option>
          <option value="openvpn">OpenVPN</option>
        </select>
      </div>
      <div className="flex items-end">
        <input type="hidden" name="platform" value="other" />
        <Button type="submit" className="w-full" disabled={loading || locations.length === 0}>
          {loading ? "Connecting…" : "Connect"}
        </Button>
      </div>
      {error ? <p className="text-sm text-danger sm:col-span-4">{error}</p> : null}
    </form>
  );
}
