"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { LocationMap, type MapLocation } from "@/components/location-map";
import { Badge, Button, Input, Label, Select } from "@/components/ui";
import { safeJson } from "@/lib/client";
import { flagEmoji } from "@/lib/format";
import {
  clientLinksFor,
  detectPlatform,
  importTips,
  openWireGuardInstall,
  prefersQrImport,
  tryOpenConfigBlob,
  type DevicePlatform,
} from "@/lib/platform";
import { cn } from "@/lib/utils";

type Step = "client" | "location" | "device" | "import";

type SetupLocation = MapLocation & {
  protocols: string[];
};

const platformOptions: Array<{ value: DevicePlatform; label: string }> = [
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" },
  { value: "linux", label: "Linux" },
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android" },
  { value: "other", label: "Other" },
];

export function SetupWizard({
  locations,
  canConnect,
  preferredLocationId,
  deviceLimitReached,
}: {
  locations: SetupLocation[];
  canConnect: boolean;
  preferredLocationId?: string | null;
  deviceLimitReached: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("client");
  const [platform, setPlatform] = useState<DevicePlatform>("other");
  const [clientReady, setClientReady] = useState(false);
  const [locationId, setLocationId] = useState(
    preferredLocationId && locations.some((l) => l.id === preferredLocationId)
      ? preferredLocationId
      : (locations[0]?.id ?? ""),
  );
  const [picker, setPicker] = useState<"map" | "list">("map");
  const [deviceName, setDeviceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const selected = locations.find((l) => l.id === locationId);
  const links = clientLinksFor(platform);
  const useQr = prefersQrImport(platform);
  const tips = importTips(platform);

  const steps: Array<{ id: Step; label: string }> = useMemo(
    () => [
      { id: "client", label: "Install app" },
      { id: "location", label: "Location" },
      { id: "device", label: "Device" },
      { id: "import", label: "Connect" },
    ],
    [],
  );

  async function prepareConfig() {
    if (!selected || !canConnect) return;
    if (deviceLimitReached) {
      setError("You’ve reached your device limit. Remove a device on the Devices page, then try again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const name =
        deviceName.trim() ||
        `${selected.city} (${links.label})`;
      const create = await fetch("/api/vpn/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: selected.id,
          protocol: "wireguard",
          name,
          platform,
        }),
      });
      const created = await safeJson(create);
      if (!create.ok || !created.id) {
        setError(created.error ?? "We couldn’t create your VPN connection. Please try again.");
        return;
      }
      const connId = created.id as string;
      setConnectionId(connId);

      const res = await fetch("/api/vpn/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connId, protocol: "wireguard" }),
      });
      if (!res.ok) {
        setError((await safeJson(res)).error ?? "We couldn’t download your configuration.");
        return;
      }
      const text = await res.text();
      const file =
        res.headers.get("Content-Disposition")?.split("filename=")[1]?.replaceAll('"', "") ??
        "northstar.conf";
      const mock = res.headers.get("X-Northstar-Mock-Config") === "true";
      setFilename(file);
      setIsMock(mock);

      if (useQr && text.length <= 1800) {
        const dataUrl = await QRCode.toDataURL(text, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 280,
          color: { dark: "#0b1f2a", light: "#ffffff" },
        });
        setQrDataUrl(dataUrl);
      } else {
        setQrDataUrl(null);
        const blob = new Blob([text], { type: "text/plain" });
        tryOpenConfigBlob(blob, file);
      }
      setStep("import");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function redownload() {
    if (!connectionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/vpn/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, protocol: "wireguard" }),
      });
      if (!res.ok) {
        setError((await safeJson(res)).error ?? "Download failed");
        return;
      }
      const text = await res.text();
      const file =
        res.headers.get("Content-Disposition")?.split("filename=")[1]?.replaceAll('"', "") ??
        filename ??
        "northstar.conf";
      tryOpenConfigBlob(new Blob([text], { type: "text/plain" }), file);
      if (useQr && text.length <= 1800) {
        setQrDataUrl(
          await QRCode.toDataURL(text, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 280,
            color: { dark: "#0b1f2a", light: "#ffffff" },
          }),
        );
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!canConnect) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl">VPN isn’t ready yet</h2>
        <p className="mt-2 text-sm text-muted">Finish billing setup before installing on this device.</p>
        <Link href="/dashboard/billing" className="mt-4 inline-block">
          <Button>Go to billing</Button>
        </Link>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl">No locations available</h2>
        <p className="mt-2 text-sm text-muted">Try again shortly, or open Locations to refresh the list.</p>
        <Link href="/dashboard/locations" className="mt-4 inline-block">
          <Button variant="secondary">Browse locations</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2" aria-label="Setup steps">
        {steps.map((s, i) => {
          const active = s.id === step;
          const done = steps.findIndex((x) => x.id === step) > i;
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={s.id === "import" && !connectionId}
                onClick={() => {
                  if (s.id === "import" && !connectionId) return;
                  setStep(s.id);
                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  active && "bg-sea text-white",
                  done && !active && "bg-sea/15 text-sea-dark dark:text-sea",
                  !active && !done && "bg-surface-2 text-muted",
                )}
              >
                {i + 1}. {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      {step === "client" ? (
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <h2 className="font-display text-2xl">Install WireGuard on this device</h2>
          <p className="mt-2 text-sm text-muted">
            Northstar uses the official WireGuard app — not a store VPN client. We detected{" "}
            <strong className="text-foreground">{links.label}</strong>; change it if that’s wrong.
          </p>
          <div className="mt-4 max-w-xs">
            <Label htmlFor="setup-platform">This device</Label>
            <Select
              id="setup-platform"
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value as DevicePlatform);
                setClientReady(false);
              }}
            >
              {platformOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" onClick={() => openWireGuardInstall(platform)}>
              Get WireGuard
            </Button>
            <Button
              type="button"
              variant={clientReady ? "secondary" : "ghost"}
              onClick={() => setClientReady(true)}
            >
              I’ve installed it
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted">
            Prefer OpenVPN instead?{" "}
            <a
              href={links.openvpn ?? "https://openvpn.net/client/"}
              className="text-sea hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get OpenVPN Connect
            </a>
            , then create a connection from{" "}
            <Link href="/dashboard/locations" className="text-sea hover:underline">
              Locations
            </Link>
            .
          </p>
          <div className="mt-6">
            <Button type="button" disabled={!clientReady} onClick={() => setStep("location")}>
              Continue
            </Button>
          </div>
        </section>
      ) : null}

      {step === "location" ? (
        <section className="space-y-4 rounded-xl border border-border bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">Choose a location</h2>
              <p className="mt-2 text-sm text-muted">
                Pick where your traffic should exit. Map dots are city centres, not exact rack positions.
              </p>
            </div>
            <div className="flex rounded-md border border-border p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-medium",
                  picker === "map" ? "bg-sea text-white" : "text-muted",
                )}
                onClick={() => setPicker("map")}
              >
                Map
              </button>
              <button
                type="button"
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-medium",
                  picker === "list" ? "bg-sea text-white" : "text-muted",
                )}
                onClick={() => setPicker("list")}
              >
                List
              </button>
            </div>
          </div>

          {picker === "map" ? (
            <LocationMap locations={locations} selectedId={locationId} onSelect={setLocationId} />
          ) : (
            <div className="max-w-md">
              <Label htmlFor="setup-location">Location</Label>
              <Select id="setup-location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {flagEmoji(l.countryCode)} {l.country} — {l.city}
                    {l.id === preferredLocationId ? " · last used" : ""}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {selected ? (
            <p className="text-sm text-foreground">
              Selected:{" "}
              <Badge tone="sea">
                {flagEmoji(selected.countryCode)} {selected.city}, {selected.country}
              </Badge>
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="ghost" onClick={() => setStep("client")}>
              Back
            </Button>
            <Button type="button" disabled={!locationId} onClick={() => setStep("device")}>
              Continue
            </Button>
          </div>
        </section>
      ) : null}

      {step === "device" ? (
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <h2 className="font-display text-2xl">Name this device</h2>
          <p className="mt-2 text-sm text-muted">
            Helps you revoke the right config later. Counts toward your plan’s device limit.
          </p>
          {deviceLimitReached ? (
            <p className="mt-3 rounded-md border border-warning bg-warning/40 px-3 py-2 text-sm text-warning-foreground">
              Device limit reached.{" "}
              <Link href="/dashboard/vpn" className="underline">
                Remove a device
              </Link>{" "}
              before continuing.
            </p>
          ) : null}
          <div className="mt-4 max-w-md">
            <Label htmlFor="setup-device-name">Device name</Label>
            <Input
              id="setup-device-name"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder={`${selected?.city ?? "VPN"} ${links.label}`}
              maxLength={80}
            />
          </div>
          {error ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="button" variant="ghost" onClick={() => setStep("location")}>
              Back
            </Button>
            <Button type="button" disabled={busy || deviceLimitReached} onClick={() => void prepareConfig()}>
              {busy ? "Preparing…" : useQr ? "Show QR & finish" : "Download config & finish"}
            </Button>
          </div>
        </section>
      ) : null}

      {step === "import" ? (
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <h2 className="font-display text-2xl">Import into WireGuard</h2>
          <p className="mt-2 text-sm text-muted">
            {selected
              ? `${flagEmoji(selected.countryCode)} ${selected.city} · WireGuard · ${links.label}`
              : "WireGuard"}
            {isMock ? " · development mock config" : ""}
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
            {tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ol>
          {qrDataUrl ? (
            <div className="mt-5 inline-block rounded-lg border border-border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="WireGuard configuration QR code" width={280} height={280} />
            </div>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void redownload()}>
              {useQr ? "Refresh QR / download file" : "Download again"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => openWireGuardInstall(platform)}>
              Open WireGuard install page
            </Button>
            <Link href="/dashboard/vpn">
              <Button type="button">Done — view devices</Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted">
            Stuck? See{" "}
            <Link href={`/download#${platform === "other" ? "windows" : platform}`} className="text-sea hover:underline">
              setup guides
            </Link>{" "}
            or{" "}
            <Link href="/dashboard/support" className="text-sea hover:underline">
              contact support
            </Link>
            .
          </p>
        </section>
      ) : null}
    </div>
  );
}
