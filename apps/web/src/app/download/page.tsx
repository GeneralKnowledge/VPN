import { brand } from "@northstar/config";
import { MarketingPage } from "@/components/marketing-page";
import { Badge } from "@/components/ui";

export const metadata = { title: "Download" };

const platforms = [
  {
    name: "Windows",
    status: "Config-based setup",
    steps: [
      "Install a WireGuard or OpenVPN client from the vendor’s official site",
      "Sign in to your Northstar dashboard and create a device",
      "Download the configuration file for your chosen location",
      "Import the file into the client and connect",
    ],
  },
  {
    name: "macOS",
    status: "Config-based setup",
    steps: [
      "Install WireGuard or Tunnelblick / OpenVPN Connect",
      "Download your Northstar configuration from the dashboard",
      "Import and connect",
    ],
  },
  {
    name: "Linux",
    status: "Config-based setup",
    steps: [
      "Install wireguard-tools or openvpn via your package manager",
      "Place the downloaded config in the appropriate directory",
      "Bring the interface up",
    ],
  },
  {
    name: "iOS",
    status: "No branded app yet",
    steps: [
      "Install the official WireGuard or OpenVPN Connect app from the App Store",
      "Import your Northstar configuration from the dashboard (Files / QR when available)",
      "Choose the profile and connect",
    ],
  },
  {
    name: "Android",
    status: "No branded app yet",
    steps: [
      "Install WireGuard or OpenVPN Connect from the Play Store",
      "Import your downloaded configuration",
      "Connect",
    ],
  },
];

export default function DownloadPage() {
  return (
    <MarketingPage
      title="Download & setup"
      description={`${brand.name} does not ship a custom mobile/desktop app yet. Use standard clients with your account configuration. When branded apps are published, they can be enabled via configuration.`}
    >
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
