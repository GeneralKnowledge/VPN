"use client";

import { useId, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui";
import { safeJson } from "@/lib/client";

async function fetchConfig(connectionId: string): Promise<{ blob: Blob; text: string; filename: string; isMock: boolean }> {
  const res = await fetch("/api/vpn/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId }),
  });
  if (!res.ok) {
    throw new Error((await safeJson(res)).error ?? "Download failed");
  }
  const blob = await res.blob();
  const text = await blob.text();
  const filename =
    res.headers.get("Content-Disposition")?.split("filename=")[1]?.replaceAll('"', "") ?? "northstar.conf";
  const isMock = res.headers.get("X-Northstar-Mock-Config") === "true";
  return { blob: new Blob([text], { type: blob.type }), text, filename, isMock };
}

export function DownloadConfigButton({
  connectionId,
  protocol,
}: {
  connectionId: string;
  protocol?: string;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogId = useId();
  const showQr = !protocol || protocol === "wireguard";

  async function download() {
    setBusy(true);
    setMsg(null);
    try {
      const { blob, filename, isMock } = await fetchConfig(connectionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(isMock ? "Mock config downloaded" : "Downloaded");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function showQrCode() {
    setBusy(true);
    setMsg(null);
    try {
      const { text, isMock } = await fetchConfig(connectionId);
      if (text.length > 1800) {
        setMsg("Config is too large for a QR code. Download the file instead.");
        return;
      }
      const dataUrl = await QRCode.toDataURL(text, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 280,
        color: { dark: "#0b1f2a", light: "#ffffff" },
      });
      setQrDataUrl(dataUrl);
      setMsg(isMock ? "Mock config QR ready" : "Scan with your WireGuard app");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not generate QR code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="secondary" type="button" disabled={busy} onClick={download}>
          Download config
        </Button>
        {showQr ? (
          <Button size="sm" variant="ghost" type="button" disabled={busy} onClick={showQrCode} aria-controls={dialogId}>
            Show QR
          </Button>
        ) : null}
      </div>
      {msg ? <span className="text-xs text-muted">{msg}</span> : null}
      {qrDataUrl ? (
        <div
          id={dialogId}
          role="dialog"
          aria-label="WireGuard configuration QR code"
          className="rounded-lg border border-border bg-surface p-3 shadow-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="WireGuard configuration QR code" width={280} height={280} className="rounded-md" />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="ghost" type="button" onClick={() => setQrDataUrl(null)}>
              Close QR
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
