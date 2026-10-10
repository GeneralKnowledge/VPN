export type DevicePlatform = "windows" | "macos" | "linux" | "ios" | "android" | "other";

export type ClientLinks = {
  wireguard: string;
  openvpn?: string;
  label: string;
};

const CLIENT_LINKS: Record<DevicePlatform, ClientLinks> = {
  windows: {
    label: "Windows",
    wireguard: "https://www.wireguard.com/install/",
    openvpn: "https://openvpn.net/client/",
  },
  macos: {
    label: "macOS",
    wireguard: "https://apps.apple.com/app/wireguard/id1451685025",
    openvpn: "https://openvpn.net/client/",
  },
  linux: {
    label: "Linux",
    wireguard: "https://www.wireguard.com/install/",
    openvpn: "https://openvpn.net/client/",
  },
  ios: {
    label: "iOS",
    wireguard: "https://apps.apple.com/app/wireguard/id1441195209",
    openvpn: "https://apps.apple.com/app/openvpn-connect/id590379981",
  },
  android: {
    label: "Android",
    wireguard: "https://play.google.com/store/apps/details?id=com.wireguard.android",
    openvpn: "https://play.google.com/store/apps/details?id=net.openvpn.openvpn",
  },
  other: {
    label: "This device",
    wireguard: "https://www.wireguard.com/install/",
    openvpn: "https://openvpn.net/client/",
  },
};

export function detectPlatform(ua = typeof navigator !== "undefined" ? navigator.userAgent : ""): DevicePlatform {
  const value = ua || "";
  if (/android/i.test(value)) return "android";
  if (/iPad|iPhone|iPod/.test(value)) return "ios";
  // iPadOS 13+ desktop UA
  if (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) {
    return "ios";
  }
  if (/Windows/i.test(value)) return "windows";
  if (/Mac OS X|Macintosh/i.test(value)) return "macos";
  if (/Linux/i.test(value)) return "linux";
  return "other";
}

export function clientLinksFor(platform: DevicePlatform): ClientLinks {
  return CLIENT_LINKS[platform];
}

export function prefersQrImport(platform: DevicePlatform): boolean {
  return platform === "ios" || platform === "android";
}

export function importTips(platform: DevicePlatform): string[] {
  switch (platform) {
    case "ios":
      return [
        "Open the WireGuard app and tap the + button.",
        "Choose Create from QR code and scan the code below.",
        "Allow VPN configuration when iOS asks, then toggle the tunnel on.",
      ];
    case "android":
      return [
        "Open the WireGuard app and tap +.",
        "Scan from QR code, or open the downloaded .conf file with WireGuard.",
        "Toggle the tunnel on. Android may ask to allow a VPN connection.",
      ];
    case "windows":
      return [
        "Open WireGuard and click Import tunnel(s) from file.",
        "Select the downloaded .conf file.",
        "Activate the tunnel. Approve the Windows VPN permission if prompted.",
      ];
    case "macos":
      return [
        "Open WireGuard from Applications.",
        "Use Import tunnel(s) from file, or AirDrop / Files for the .conf.",
        "Activate the tunnel and allow the VPN configuration when asked.",
      ];
    case "linux":
      return [
        "Install wireguard-tools if needed (for example: sudo apt install wireguard).",
        "Move the .conf into /etc/wireguard/ and run: sudo wg-quick up <name>.",
        "Or import the file into a desktop WireGuard client if you use one.",
      ];
    default:
      return [
        "Install the official WireGuard client for your system.",
        "Import the downloaded .conf (or scan the QR on mobile).",
        "Activate the tunnel to connect.",
      ];
  }
}

/** Best-effort: open the WireGuard store / install page for this platform. */
export function openWireGuardInstall(platform: DevicePlatform): void {
  if (typeof window === "undefined") return;
  window.open(clientLinksFor(platform).wireguard, "_blank", "noopener,noreferrer");
}

/**
 * Best-effort open of a downloaded config with the OS handler.
 * Mobile browsers often ignore this; QR remains the reliable path there.
 */
export function tryOpenConfigBlob(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Secondary attempt: open the blob URL (some Android browsers offer "Open with").
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    /* ignore */
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
