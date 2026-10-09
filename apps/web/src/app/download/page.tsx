import Link from "next/link";
import { brand } from "@northstar/config";
import { MarketingPage } from "@/components/marketing-page";
import { Badge, Button } from "@/components/ui";

export const metadata = {
  title: "Download & setup",
  description: `${brand.name} setup guides for Windows, macOS, Linux, iOS, and Android using WireGuard or OpenVPN.`,
};

const platforms = [
  {
    id: "windows",
    name: "Windows",
    status: "WireGuard or OpenVPN",
    clientUrl: "https://www.wireguard.com/install/",
    steps: [
      "Install WireGuard or OpenVPN Connect from the vendor’s official site",
      "Sign in to your Northstar dashboard and pick a location",
      "Download the configuration file (or use OpenVPN with your VPN password)",
      "Import the file into the client and connect",
    ],
  },
  {
    id: "macos",
    name: "macOS",
    status: "WireGuard or OpenVPN",
    clientUrl: "https://www.wireguard.com/install/",
    steps: [
      "Install WireGuard from the Mac App Store, or Tunnelblick / OpenVPN Connect",
      "Download your Northstar configuration from the dashboard",
      "Import the profile and connect",
    ],
  },
  {
    id: "linux",
    name: "Linux",
    status: "wireguard-tools or OpenVPN",
    clientUrl: "https://www.wireguard.com/install/",
    steps: [
      "Install wireguard-tools or openvpn via your package manager",
      "Place the downloaded config in the appropriate directory",
      "Bring the interface up (for example wg-quick up …)",
    ],
  },
  {
    id: "ios",
    name: "iOS",
    status: "Official WireGuard / OpenVPN apps",
    clientUrl: "https://apps.apple.com/app/wireguard/id1441195209",
    steps: [
      "Install the official WireGuard or OpenVPN Connect app from the App Store",
      "In your Northstar dashboard, download a config or tap Show QR for WireGuard",
      "Import via Files or scan the QR, then connect",
    ],
  },
  {
    id: "android",
    name: "Android",
    status: "Official WireGuard / OpenVPN apps",
    clientUrl: "https://play.google.com/store/apps/details?id=com.wireguard.android",
    steps: [
      "Install WireGuard or OpenVPN Connect from the Play Store",
      "Download your configuration or scan the WireGuard QR from the dashboard",
      "Import and connect",
    ],
  },
];

export default function DownloadPage() {
  return (
    <MarketingPage
      title="Download & setup"
      description={`${brand.name} works with the standard WireGuard and OpenVPN apps. Download a configuration from your dashboard — or scan a WireGuard QR — and import it on your device.`}
    >
      <div className="mb-8 flex flex-wrap gap-3">
        <Link href="/register">
          <Button>Create an account</Button>
        </Link>
        <Link href="/dashboard/vpn">
          <Button variant="secondary">Open dashboard VPN</Button>
        </Link>
      </div>

      <div className="space-y-8">
        {platforms.map((p) => (
          <section key={p.id} id={p.id} className="scroll-mt-24 rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl">{p.name}</h2>
              <Badge tone="sea">{p.status}</Badge>
            </div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
              {p.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="mt-4 text-sm">
              <a href={p.clientUrl} className="text-sea hover:underline" rel="noopener noreferrer" target="_blank">
                Get the official client
              </a>
            </p>
          </section>
        ))}
      </div>
    </MarketingPage>
  );
}
