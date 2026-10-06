export type SetupPlatform = "ios" | "android" | "windows" | "macos" | "linux";
export type SetupProtocol = "wireguard" | "openvpn";

export const SETUP_PLATFORMS: Array<{
  id: SetupPlatform;
  label: string;
  shortLabel: string;
  mobile: boolean;
}> = [
  { id: "ios", label: "iPhone / iPad", shortLabel: "iOS", mobile: true },
  { id: "android", label: "Android", shortLabel: "Android", mobile: true },
  { id: "windows", label: "Windows", shortLabel: "Windows", mobile: false },
  { id: "macos", label: "Mac", shortLabel: "macOS", mobile: false },
  { id: "linux", label: "Linux", shortLabel: "Linux", mobile: false },
];

export function getClientInstall(platform: SetupPlatform, protocol: SetupProtocol) {
  if (protocol === "wireguard") {
    switch (platform) {
      case "ios":
        return {
          appName: "WireGuard",
          storeLabel: "App Store",
          storeUrl: "https://apps.apple.com/app/wireguard/id1441195209",
          importHint: "Open WireGuard → tap + → Create from QR code (or import the .conf file).",
        };
      case "android":
        return {
          appName: "WireGuard",
          storeLabel: "Play Store",
          storeUrl: "https://play.google.com/store/apps/details?id=com.wireguard.android",
          importHint: "Open WireGuard → tap + → Scan from QR code (or import the .conf file).",
        };
      case "windows":
        return {
          appName: "WireGuard",
          storeLabel: "wireguard.com",
          storeUrl: "https://www.wireguard.com/install/",
          importHint: "Open WireGuard → Add Tunnel → Import tunnel(s) from file → Activate.",
        };
      case "macos":
        return {
          appName: "WireGuard",
          storeLabel: "App Store / wireguard.com",
          storeUrl: "https://apps.apple.com/app/wireguard/id1451685025",
          importHint: "Open WireGuard → Import tunnel(s) from file → Activate.",
        };
      case "linux":
        return {
          appName: "wireguard-tools",
          storeLabel: "Install guide",
          storeUrl: "https://www.wireguard.com/install/",
          importHint: "Save the .conf and bring the interface up with wg-quick (or your network manager).",
        };
    }
  }

  switch (platform) {
    case "ios":
      return {
        appName: "OpenVPN Connect",
        storeLabel: "App Store",
        storeUrl: "https://apps.apple.com/app/openvpn-connect/id590379981",
        importHint: "Open OpenVPN Connect → Import the .ovpn file → Connect.",
      };
    case "android":
      return {
        appName: "OpenVPN Connect",
        storeLabel: "Play Store",
        storeUrl: "https://play.google.com/store/apps/details?id=net.openvpn.openvpn",
        importHint: "Open OpenVPN Connect → Import the .ovpn file → Connect.",
      };
    case "windows":
      return {
        appName: "OpenVPN Connect",
        storeLabel: "openvpn.net",
        storeUrl: "https://openvpn.net/client/",
        importHint: "Install OpenVPN Connect → Import the .ovpn profile → Connect.",
      };
    case "macos":
      return {
        appName: "OpenVPN Connect / Tunnelblick",
        storeLabel: "openvpn.net",
        storeUrl: "https://openvpn.net/client/",
        importHint: "Import the .ovpn profile into OpenVPN Connect or Tunnelblick, then connect.",
      };
    case "linux":
      return {
        appName: "OpenVPN",
        storeLabel: "Package manager",
        storeUrl: "https://openvpn.net/community-downloads/",
        importHint: "Install openvpn via your package manager and start with the downloaded .ovpn file.",
      };
  }
}

export const CANT_CONNECT_CHECKLIST = [
  "You installed the official WireGuard app (not a random “VPN” from search).",
  "You imported the Northstar config (QR or .conf file) into that app.",
  "VPN permission / profile was allowed when the OS asked.",
  "The tunnel shows as Active / Connected in the client.",
  "You tried the suggested location, then one other city if needed.",
  "If WireGuard is blocked on your network, try OpenVPN from Get Connected.",
] as const;
