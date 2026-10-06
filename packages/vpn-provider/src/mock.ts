import type {
  CreateAccountInput,
  CreateConnectionInput,
  VpnAccount,
  VpnConnectionConfig,
  VpnLocation,
  VPNProvider,
} from "./types";
import { VpnProviderError } from "./types";

/** Development fixtures only — not production inventory. */
export const MOCK_LOCATIONS: VpnLocation[] = [
  {
    id: "mock-uk-london",
    providerId: "srv-uk-1",
    country: "United Kingdom",
    countryCode: "GB",
    city: "London",
    region: "Europe",
    hostname: "lon1.mock.northstar.local",
    status: "online",
    protocolSupport: ["wireguard", "openvpn"],
    latency: 18,
    load: 32,
  },
  {
    id: "mock-de-frankfurt",
    providerId: "srv-de-1",
    country: "Germany",
    countryCode: "DE",
    city: "Frankfurt",
    region: "Europe",
    hostname: "fra1.mock.northstar.local",
    status: "online",
    protocolSupport: ["wireguard", "openvpn"],
    latency: 28,
    load: 41,
  },
  {
    id: "mock-nl-amsterdam",
    providerId: "srv-nl-1",
    country: "Netherlands",
    countryCode: "NL",
    city: "Amsterdam",
    region: "Europe",
    hostname: "ams1.mock.northstar.local",
    status: "online",
    protocolSupport: ["wireguard", "openvpn", "vless"],
    latency: 30,
    load: 27,
  },
  {
    id: "mock-us-newyork",
    providerId: "srv-us-1",
    country: "United States",
    countryCode: "US",
    city: "New York",
    region: "North America",
    hostname: "nyc1.mock.northstar.local",
    status: "online",
    protocolSupport: ["wireguard", "openvpn"],
    latency: 85,
    load: 55,
  },
  {
    id: "mock-us-losangeles",
    providerId: "srv-us-2",
    country: "United States",
    countryCode: "US",
    city: "Los Angeles",
    region: "North America",
    hostname: "lax1.mock.northstar.local",
    status: "online",
    protocolSupport: ["wireguard", "openvpn"],
    latency: 120,
    load: 48,
  },
  {
    id: "mock-ca-toronto",
    providerId: "srv-ca-1",
    country: "Canada",
    countryCode: "CA",
    city: "Toronto",
    region: "North America",
    hostname: "tor1.mock.northstar.local",
    status: "online",
    protocolSupport: ["wireguard", "openvpn"],
    latency: 95,
    load: 36,
  },
  {
    id: "mock-ch-zurich",
    providerId: "srv-ch-1",
    country: "Switzerland",
    countryCode: "CH",
    city: "Zurich",
    region: "Europe",
    hostname: "zrh1.mock.northstar.local",
    status: "online",
    protocolSupport: ["wireguard", "openvpn"],
    latency: 40,
    load: 22,
  },
  {
    id: "mock-jp-tokyo",
    providerId: "srv-jp-1",
    country: "Japan",
    countryCode: "JP",
    city: "Tokyo",
    region: "Asia",
    hostname: "tyo1.mock.northstar.local",
    status: "online",
    protocolSupport: ["wireguard", "openvpn"],
    latency: 180,
    load: 44,
  },
];

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export class MockVPNProvider implements VPNProvider {
  private accounts = new Map<string, VpnAccount>();

  async getProviderStatus() {
    return { ok: true, provider: "mock", detail: "Mock VPN provider operational" };
  }

  async listLocations(): Promise<VpnLocation[]> {
    return MOCK_LOCATIONS.map((l) => ({ ...l }));
  }

  async createAccount(input: CreateAccountInput): Promise<VpnAccount> {
    if (!input.username || input.username.length < 3) {
      throw new VpnProviderError("Username too short", "validation");
    }
    for (const existing of this.accounts.values()) {
      if (existing.username === input.username) {
        throw new VpnProviderError("Username already taken", "conflict");
      }
    }
    const account: VpnAccount = {
      id: randomId("mockacct"),
      providerAccountId: randomId("pva"),
      username: input.username,
      status: "active",
      customerExternalId: input.externalCustomerId,
      expiresAt: input.expiresAt ?? null,
      createdAt: new Date().toISOString(),
    };
    this.accounts.set(account.providerAccountId, account);
    return { ...account };
  }

  async getAccount(providerAccountId: string): Promise<VpnAccount> {
    const account = this.accounts.get(providerAccountId);
    if (!account) throw new VpnProviderError("Account not found", "not_found");
    return { ...account };
  }

  async findAccountByUsername(username: string): Promise<VpnAccount | null> {
    for (const account of this.accounts.values()) {
      if (account.username === username) return { ...account };
    }
    return null;
  }

  async suspendAccount(providerAccountId: string): Promise<VpnAccount> {
    const account = await this.getAccount(providerAccountId);
    account.status = "disabled";
    this.accounts.set(providerAccountId, account);
    return { ...account };
  }

  async reactivateAccount(providerAccountId: string): Promise<VpnAccount> {
    const account = await this.getAccount(providerAccountId);
    account.status = "active";
    this.accounts.set(providerAccountId, account);
    return { ...account };
  }

  async deleteAccount(providerAccountId: string): Promise<void> {
    if (!this.accounts.has(providerAccountId)) {
      throw new VpnProviderError("Account not found", "not_found");
    }
    this.accounts.delete(providerAccountId);
  }

  async getConnectionConfig(input: CreateConnectionInput): Promise<VpnConnectionConfig> {
    // Mock configs do not require an in-memory account — provisioning may have
    // happened in a previous process/request. Still validate location/protocol.
    if (!input.accountId) {
      throw new VpnProviderError("Account id required", "validation");
    }
    const location = MOCK_LOCATIONS.find((l) => l.id === input.locationId || l.providerId === input.locationId);
    if (!location) throw new VpnProviderError("Location not found", "not_found");
    if (!location.protocolSupport.includes(input.protocol)) {
      throw new VpnProviderError("Protocol not supported at location", "validation");
    }

    const banner = [
      "# ============================================================",
      "# MOCK CONFIGURATION — NOT FOR PRODUCTION USE",
      "# Generated by MockVPNProvider for Northstar VPN development",
      "# These credentials and endpoints do not exist on a real network",
      "# ============================================================",
      "",
    ].join("\n");

    if (input.protocol === "wireguard") {
      const content = `${banner}[Interface]
PrivateKey = MOCK_PRIVATE_KEY_DO_NOT_USE_${input.accountId.slice(-6)}
Address = 10.66.0.${Math.floor(Math.random() * 200) + 2}/32
DNS = 10.66.0.1

[Peer]
PublicKey = MOCK_SERVER_PUBLIC_KEY_NOT_REAL
Endpoint = ${location.hostname}:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
`;
      return {
        protocol: "wireguard",
        locationId: location.id,
        content,
        filename: `northstar-mock-${location.countryCode.toLowerCase()}-${location.city.toLowerCase()}.conf`,
        contentType: "text/plain",
        isMock: true,
      };
    }

    if (input.protocol === "openvpn") {
      const content = `${banner}client
dev tun
proto udp
remote ${location.hostname} 1194
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
verb 3
# MOCK certs intentionally omitted
`;
      return {
        protocol: "openvpn",
        locationId: location.id,
        content,
        filename: `northstar-mock-${location.countryCode.toLowerCase()}.ovpn`,
        contentType: "application/x-openvpn-profile",
        isMock: true,
      };
    }

    const content = `${banner}vless://MOCK_UUID@${location.hostname}:443?encryption=none&security=reality&type=tcp#Northstar-MOCK-${location.city}`;
    return {
      protocol: "vless",
      locationId: location.id,
      content,
      filename: `northstar-mock-${location.city.toLowerCase()}-vless.txt`,
      contentType: "text/plain",
      isMock: true,
    };
  }

  /** Test helper */
  _seedAccount(account: VpnAccount) {
    this.accounts.set(account.providerAccountId, account);
  }
}
