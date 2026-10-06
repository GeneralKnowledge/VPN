import Link from "next/link";
import { brand } from "@northstar/config";
import { MarketingPage } from "@/components/marketing-page";
import { Badge, Button } from "@/components/ui";

export const metadata = { title: "Download" };

const platforms = [
  {
    name: "Windows",
    status: "Config-based setup",
    steps: [
      "Follow Get connected in your dashboard (recommended)",
      "Or install WireGuard from wireguard.com",
      "Download your Northstar .conf and import the tunnel",
    ],
  },
  {
    name: "macOS",
    status: "Config-based setup",
    steps: [
      "Use Get connected for step-by-step import",
      "Install WireGuard from the App Store",
      "Import your Northstar configuration and activate",
    ],
  },
  {
    name: "Linux",
    status: "Config-based setup",
    steps: [
      "Install wireguard-tools via your package manager",
      "Download the .conf from the dashboard",
      "Bring the interface up with wg-quick or NetworkManager",
    ],
  },
  {
    name: "iOS",
    status: "WireGuard + QR",
    steps: [
      "Install the official WireGuard app from the App Store",
      "Open Get connected → scan the QR (or import the .conf)",
      "Allow VPN and activate the tunnel",
    ],
  },
  {
    name: "Android",
    status: "WireGuard + QR",
    steps: [
      "Install WireGuard from the Play Store",
      "Scan the QR from Get connected (or import the file)",
      "Activate the tunnel",
    ],
  },
];

export default function DownloadPage() {
  return (
    <MarketingPage
      title="Download & setup"
      description={`${brand.name} uses standard WireGuard (default) or OpenVPN clients — no custom app required. After you subscribe, the Get connected guide walks you through install and import.`}
    >
      <div className="mb-8 rounded-xl border border-border bg-surface p-5">
        <h2 className="font-display text-2xl">Fastest path</h2>
        <p className="mt-2 text-sm text-muted">
          Sign in → Get connected → pick your device → install WireGuard → import config → connect.
        </p>
        <Link href="/dashboard/get-connected" className="mt-4 inline-block">
          <Button>Open Get connected</Button>
        </Link>
      </div>
      <div className="space-y-8">
        {platforms.map((p) => (
          <div key={p.name} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl">{p.name}</h2>
              <Badge tone="sea">{p.status}</Badge>
            </div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
              {p.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </MarketingPage>
  );
}
