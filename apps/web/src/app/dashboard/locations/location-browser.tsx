"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { LocationMap } from "@/components/location-map";
import { Badge, Button, EmptyState, Input, Label, Select } from "@/components/ui";
import { safeJson } from "@/lib/client";
import { flagEmoji } from "@/lib/format";
import { detectPlatform, type DevicePlatform } from "@/lib/platform";
import { cn } from "@/lib/utils";

export interface BrowserLocation {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  status: string;
  protocols: string[];
  latitude: number;
  longitude: number;
}

const protocolLabels: Record<string, string> = {
  wireguard: "WireGuard",
  openvpn: "OpenVPN",
  vless: "VLESS",
};

export function LocationBrowser({
  locations,
  canConnect,
  preferredLocationId,
}: {
  locations: BrowserLocation[];
  canConnect: boolean;
  preferredLocationId?: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [view, setView] = useState<"map" | "list">("map");
  const [platform, setPlatform] = useState<DevicePlatform>("other");
  const [selectedId, setSelectedId] = useState(
    preferredLocationId && locations.some((l) => l.id === preferredLocationId)
      ? preferredLocationId
      : (locations[0]?.id ?? ""),
  );
  const [protocol, setProtocol] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const countries = useMemo(
    () => Array.from(new Set(locations.map((l) => l.country))).sort((a, b) => a.localeCompare(b)),
    [locations],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return locations.filter(
      (l) =>
        (!country || l.country === country) &&
        (!q || l.city.toLowerCase().includes(q) || l.country.toLowerCase().includes(q)),
    );
  }, [locations, query, country]);

  const grouped = useMemo(() => {
    const map = new Map<string, BrowserLocation[]>();
    for (const l of filtered) map.set(l.country, [...(map.get(l.country) ?? []), l]);
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const selected = locations.find((l) => l.id === selectedId);
  const effectiveProtocol =
    selected && protocol && selected.protocols.includes(protocol) ? protocol : (selected?.protocols[0] ?? "");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || !effectiveProtocol) return;
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/vpn/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: selected.id,
          name: String(fd.get("name") || "").trim() || `${selected.city} device`,
          protocol: effectiveProtocol,
          platform: String(fd.get("platform") || platform),
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error ?? "We couldn’t create your VPN connection. Please try again.");
        setLoading(false);
        return;
      }
      const cfg = await fetch("/api/vpn/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: data.id }),
      });
      if (!cfg.ok) {
        setError(
          (await safeJson(cfg)).error ??
            "Your connection was created but the configuration couldn’t be downloaded. Download it from Your VPN.",
        );
        setLoading(false);
        router.refresh();
        return;
      }
      const blob = await cfg.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        cfg.headers.get("Content-Disposition")?.split("filename=")[1]?.replaceAll('"', "") ?? "northstar.conf";
      a.click();
      URL.revokeObjectURL(url);
      router.push("/dashboard/vpn");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {canConnect ? (
        <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-4">
          <div className="sm:col-span-4">
            <p className="text-sm text-muted">Selected location</p>
            <p className="font-medium">
              {selected
                ? `${flagEmoji(selected.countryCode)} ${selected.city}, ${selected.country}${
                    selected.id === preferredLocationId ? " · last used" : ""
                  }`
                : "Choose a location below"}
            </p>
          </div>
          <div>
            <Label htmlFor="name">Device name</Label>
            <Input id="name" name="name" placeholder="Laptop" maxLength={80} />
          </div>
          <div>
            <Label htmlFor="platform">Platform</Label>
            <Select
              id="platform"
              name="platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as DevicePlatform)}
            >
              <option value="windows">Windows</option>
              <option value="macos">macOS</option>
              <option value="linux">Linux</option>
              <option value="ios">iOS</option>
              <option value="android">Android</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="protocol">Protocol</Label>
            <Select
              id="protocol"
              value={effectiveProtocol}
              onChange={(e) => setProtocol(e.target.value)}
              disabled={!selected}
            >
              {(selected?.protocols ?? []).map((p) => (
                <option key={p} value={p}>
                  {protocolLabels[p] ?? p}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={loading || !selected || !effectiveProtocol} aria-busy={loading}>
              {loading ? "Connecting…" : "Connect"}
            </Button>
          </div>
          <div role="alert" className="sm:col-span-4">
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </div>
        </form>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <Label htmlFor="location-search">Search locations</Label>
            <Input
              id="location-search"
              type="search"
              placeholder="City or country"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="sm:w-56">
            <Label htmlFor="location-country">Country</Label>
            <Select id="location-country" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex rounded-md border border-border p-0.5">
          <button
            type="button"
            className={cn("rounded px-3 py-1.5 text-xs font-medium", view === "map" ? "bg-sea text-white" : "text-muted")}
            onClick={() => setView("map")}
          >
            Map
          </button>
          <button
            type="button"
            className={cn("rounded px-3 py-1.5 text-xs font-medium", view === "list" ? "bg-sea text-white" : "text-muted")}
            onClick={() => setView("list")}
          >
            List
          </button>
        </div>
      </div>

      <p className="text-sm text-muted" aria-live="polite">
        {filtered.length} {filtered.length === 1 ? "location" : "locations"}
      </p>

      {view === "map" ? (
        filtered.length === 0 ? (
          <EmptyState
            title="No locations match"
            description="Try a different search or clear the country filter."
            action={
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setQuery("");
                  setCountry("");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <LocationMap
            locations={filtered}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setProtocol("");
              setError(null);
            }}
          />
        )
      ) : grouped.length === 0 ? (
        <EmptyState
          title="No locations match"
          description="Try a different search or clear the country filter."
          action={
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setQuery("");
                setCountry("");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([countryName, items]) => (
            <section key={countryName} aria-labelledby={`country-${countryName}`}>
              <h2 id={`country-${countryName}`} className="mb-2 font-display text-lg">
                {flagEmoji(items[0]?.countryCode)} {countryName}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((l) => {
                  const active = l.id === selectedId;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      aria-pressed={active}
                      disabled={!canConnect}
                      onClick={() => {
                        setSelectedId(l.id);
                        setProtocol("");
                        setError(null);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className={cn(
                        "rounded-xl border bg-surface p-4 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea",
                        canConnect && "hover:border-sea",
                        active ? "border-sea ring-1 ring-sea" : "border-border",
                        !canConnect && "cursor-default",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{l.city}</p>
                        <Badge tone={l.status === "online" ? "success" : "warning"}>
                          {l.status === "online" ? "Online" : "Limited"}
                        </Badge>
                      </div>
                      <p className="mt-1 font-mono text-xs text-muted">
                        {l.protocols.map((p) => protocolLabels[p] ?? p).join(" · ")}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
