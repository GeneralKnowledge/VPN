"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Button, Card } from "@/components/ui";
import {
  CANT_CONNECT_CHECKLIST,
  SETUP_PLATFORMS,
  getClientInstall,
  type SetupPlatform,
  type SetupProtocol,
} from "@/lib/setup-guides";

type ConnectionOption = {
  id: string;
  name: string;
  protocol: string;
  city: string;
  country: string;
};

type ConfigPayload = {
  content: string;
  filename: string;
  protocol: string;
  isMock: boolean;
  location: { city: string; country: string };
};

export function GetConnectedWizard({
  connections,
  vpnReady,
}: {
  connections: ConnectionOption[];
  vpnReady: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState<SetupPlatform | null>(null);
  const [protocol, setProtocol] = useState<SetupProtocol>("wireguard");
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? "");
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOpenVpn, setShowOpenVpn] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const selected = connections.find((c) => c.id === connectionId) ?? connections[0];
  const install = platform ? getClientInstall(platform, protocol) : null;
  const isMobile = platform ? SETUP_PLATFORMS.find((p) => p.id === platform)?.mobile : false;

  useEffect(() => {
    if (!config || !isMobile || protocol !== "wireguard") {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(config.content, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 280,
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [config, isMobile, protocol]);

  async function loadConfig(nextConnectionId: string, nextProtocol: SetupProtocol) {
    setLoading(true);
    setError(null);
    setConfig(null);
    const res = await fetch("/api/vpn/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId: nextConnectionId,
        protocol: nextProtocol,
        format: "json",
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not load configuration");
      return;
    }
    setConfig(data as ConfigPayload);
  }

  async function downloadFile() {
    if (!connectionId) return;
    setError(null);
    const res = await fetch("/api/vpn/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, protocol, format: "file" }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? "Download failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      res.headers.get("Content-Disposition")?.split("filename=")[1]?.replaceAll('"', "") ??
      (protocol === "openvpn" ? "northstar.ovpn" : "northstar.conf");
    a.click();
    URL.revokeObjectURL(url);
  }

  async function finish() {
    if (!platform) return;
    setFinishing(true);
    await fetch("/api/vpn/setup-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, protocol, connectionId: connectionId || undefined }),
    });
    try {
      localStorage.setItem("northstar_setup_completed", "1");
    } catch {
      /* ignore */
    }
    setFinishing(false);
    router.push("/dashboard");
    router.refresh();
  }

  if (!vpnReady) {
    return (
      <Card>
        <h2 className="font-display text-xl">VPN access not ready yet</h2>
        <p className="mt-2 text-sm text-muted">
          Subscribe first — once your account is provisioned, this guide will walk you through connecting
          in a few steps.
        </p>
        <Button className="mt-4" type="button" onClick={() => router.push("/dashboard/billing")}>
          Go to billing
        </Button>
      </Card>
    );
  }

  if (connections.length === 0) {
    return (
      <Card>
        <h2 className="font-display text-xl">Preparing your connection…</h2>
        <p className="mt-2 text-sm text-muted">
          Your VPN account is active, but a default tunnel is not ready yet. Create one from Locations, then
          return here.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => router.push("/dashboard/locations")}>
            Choose a location
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.refresh()}>
            Refresh
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs text-muted">
        {["Device", "Install app", "Import config", "Connected?"].map((label, i) => (
          <span
            key={label}
            className={`rounded-md px-2 py-1 ${i === step ? "bg-sea/15 text-sea" : i < step ? "bg-success/15 text-success" : "bg-surface-2"}`}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {step === 0 ? (
        <Card>
          <h2 className="font-display text-xl">What device are you setting up?</h2>
          <p className="mt-1 text-sm text-muted">We&apos;ll show only the steps for that device. WireGuard is the default.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {SETUP_PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`rounded-lg border px-4 py-3 text-left text-sm transition hover:border-sea ${
                  platform === p.id ? "border-sea bg-sea/5" : "border-border bg-surface"
                }`}
                onClick={() => setPlatform(p.id)}
              >
                <span className="font-medium">{p.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="button" disabled={!platform} onClick={() => setStep(1)}>
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 1 && platform && install ? (
        <Card>
          <h2 className="font-display text-xl">Install {install.appName}</h2>
          <p className="mt-1 text-sm text-muted">
            Use the official client only — random VPN apps from search will not work with your Northstar
            config.
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>
              Install from{" "}
              <a className="text-sea underline" href={install.storeUrl} target="_blank" rel="noreferrer">
                {install.storeLabel}
              </a>
            </li>
            <li>Open the app once so it can request VPN permission later.</li>
            <li>Come back here for your Northstar configuration.</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={install.storeUrl} target="_blank" rel="noreferrer">
              <Button type="button">Open {install.storeLabel}</Button>
            </a>
            <Button type="button" variant="secondary" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button
              type="button"
              onClick={async () => {
                setStep(2);
                if (connectionId) await loadConfig(connectionId, protocol);
              }}
            >
              I installed the app
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 2 && platform && install ? (
        <Card>
          <h2 className="font-display text-xl">Import your Northstar config</h2>
          <p className="mt-1 text-sm text-muted">{install.importHint}</p>

          <div className="mt-4">
            <label className="mb-1.5 block text-sm font-medium">Location</label>
            <select
              className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
              value={connectionId}
              onChange={async (e) => {
                const id = e.target.value;
                setConnectionId(id);
                await loadConfig(id, protocol);
              }}
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.city}, {c.country} · {c.protocol}
                </option>
              ))}
            </select>
          </div>

          {loading ? <p className="mt-4 text-sm text-muted">Preparing configuration…</p> : null}
          {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

          {config ? (
            <div className="mt-4 space-y-4">
              {config.isMock ? (
                <p className="rounded-md bg-warning/15 px-3 py-2 text-sm text-warning">
                  Mock configuration — for development only, not a live tunnel.
                </p>
              ) : null}
              <p className="text-sm text-muted">
                Ready for {config.location.city}, {config.location.country} ({config.protocol}).
              </p>
              {isMobile && protocol === "wireguard" && qrDataUrl ? (
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrDataUrl}
                    alt="WireGuard configuration QR code"
                    className="rounded-lg border border-border bg-white p-2"
                    width={280}
                    height={280}
                  />
                  <p className="max-w-xs text-sm text-muted">
                    On your phone: open WireGuard → + → Create from QR code → scan this code → Allow VPN →
                    Activate.
                  </p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void downloadFile()}>
                  Download {protocol === "openvpn" ? ".ovpn" : ".conf"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="button" onClick={() => setStep(3)}>
                  I imported it
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-6 border-t border-border pt-4">
            <button
              type="button"
              className="text-sm text-sea underline"
              onClick={() => setShowOpenVpn((v) => !v)}
            >
              Having trouble with WireGuard?
            </button>
            {showOpenVpn ? (
              <div className="mt-3 space-y-2 text-sm text-muted">
                <p>
                  Some networks block WireGuard. Switch to OpenVPN, install OpenVPN Connect, then download
                  an <span className="font-mono">.ovpn</span> profile instead.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    setProtocol("openvpn");
                    if (connectionId) await loadConfig(connectionId, "openvpn");
                  }}
                >
                  Use OpenVPN instead
                </Button>
                {protocol === "openvpn" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      setProtocol("wireguard");
                      if (connectionId) await loadConfig(connectionId, "wireguard");
                    }}
                  >
                    Back to WireGuard
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {step === 3 && platform ? (
        <Card>
          <h2 className="font-display text-xl">Are you connected?</h2>
          <p className="mt-1 text-sm text-muted">
            In the client, the tunnel for {selected?.city ?? "your location"} should show as Active /
            Connected. Optionally open a &quot;what is my IP&quot; site in a new tab to confirm the location
            changed.
          </p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">
            {CANT_CONNECT_CHECKLIST.slice(0, 4).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" disabled={finishing} onClick={() => void finish()}>
              {finishing ? "Saving…" : "Yes — I'm connected"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setStep(2)}>
              Back to import
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push("/dashboard/support")}>
              Still stuck? Support checklist
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
