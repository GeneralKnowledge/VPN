"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { Button, Input, Label, Select } from "@/components/ui";
import { safeJson } from "@/lib/client";
import { flagEmoji } from "@/lib/format";
import { detectPlatform, type DevicePlatform } from "@/lib/platform";

const platforms = [
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" },
  { value: "linux", label: "Linux" },
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android" },
  { value: "other", label: "Other" },
] as const;

export function QuickConnect({
  locations,
  connections,
  preferredLocationId,
}: {
  locations: Array<{ id: string; city: string; country: string; countryCode?: string }>;
  connections: Array<{ id: string; locationId: string; protocol: string }>;
  preferredLocationId?: string | null;
}) {
  const router = useRouter();
  const selectId = useId();
  const platformId = useId();
  const nameId = useId();
  const ordered = useMemo(() => {
    if (!preferredLocationId) return locations;
    const preferred = locations.find((l) => l.id === preferredLocationId);
    if (!preferred) return locations;
    return [preferred, ...locations.filter((l) => l.id !== preferredLocationId)];
  }, [locations, preferredLocationId]);
  const [locationId, setLocationId] = useState(ordered[0]?.id ?? "");
  const [platform, setPlatform] = useState<DevicePlatform>("other");
  const [deviceName, setDeviceName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  async function connect() {
    if (!locationId) return;
    setLoading(true);
    setStatus(null);
    const loc = locations.find((l) => l.id === locationId);
    let connectionId = connections.find((c) => c.locationId === locationId && c.protocol === "wireguard")?.id;
    if (!connectionId) {
      const name = deviceName.trim() || `${loc?.city ?? "VPN"} (${platforms.find((p) => p.value === platform)?.label ?? "device"})`;
      const create = await fetch("/api/vpn/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          protocol: "wireguard",
          name,
          platform,
        }),
      });
      const created = await safeJson(create);
      if (!create.ok || !created.id) {
        setStatus(created.error ?? "We couldn’t create your VPN connection. Please try again.");
        setLoading(false);
        return;
      }
      connectionId = created.id as string;
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
        ? "Configuration downloaded (development mock). Import it into WireGuard, then mark setup complete if needed."
        : "Configuration downloaded. Import it into WireGuard to connect.",
    );
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor={selectId}>Location{preferredLocationId && locationId === preferredLocationId ? " (recommended)" : ""}</Label>
        <Select id={selectId} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          {ordered.map((l) => (
            <option key={l.id} value={l.id}>
              {flagEmoji(l.countryCode ?? "")} {l.country} — {l.city}
              {l.id === preferredLocationId ? " · last used" : ""}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={nameId}>Device name</Label>
        <Input
          id={nameId}
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder="Laptop"
          maxLength={80}
        />
      </div>
      <div>
        <Label htmlFor={platformId}>Platform</Label>
        <Select
          id={platformId}
          value={platform}
          onChange={(e) => setPlatform(e.target.value as (typeof platforms)[number]["value"])}
        >
          {platforms.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="sm:col-span-2 flex flex-wrap gap-3">
        <Button type="button" onClick={connect} disabled={loading || !locationId}>
          {loading ? "Preparing…" : "Connect & download"}
        </Button>
        <Link href="/dashboard/setup">
          <Button type="button" variant="secondary">
            Set up this device
          </Button>
        </Link>
      </div>
      {status ? (
        <p className="sm:col-span-2 text-sm text-muted" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
