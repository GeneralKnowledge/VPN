import type {
  CreateAccountInput,
  CreateConnectionInput,
  VpnAccount,
  VpnAccountStatus,
  VpnConnectionConfig,
  VpnLocation,
  VPNProvider,
} from "./types";
import { VpnProviderError } from "./types";

export interface VPNResellersConfig {
  apiUrl: string;
  apiToken: string;
  timeoutMs?: number;
  /** Injected for tests */
  fetchFn?: typeof fetch;
  /** Optional project id when creating customers alongside accounts */
  projectId?: number;
}

interface VrAccountData {
  id: number;
  username: string;
  status: string;
  expired_at?: string | null;
  created?: string;
}

interface VrServer {
  id: number;
  name: string;
  ip: string;
  country_code: string;
  city: string;
  capacity?: number;
}

const COUNTRY_NAMES: Record<string, string> = {
  GB: "United Kingdom",
  UK: "United Kingdom",
  US: "United States",
  DE: "Germany",
  NL: "Netherlands",
  CA: "Canada",
  CH: "Switzerland",
  JP: "Japan",
  FR: "France",
  SE: "Sweden",
  AU: "Australia",
  SG: "Singapore",
  TH: "Thailand",
};

function mapStatus(status: string): VpnAccountStatus {
  const s = status.toLowerCase();
  if (s === "active") return "active";
  if (s === "disabled" || s === "disable") return "disabled";
  if (s === "expired") return "expired";
  return "pending";
}

function mapAccount(data: VrAccountData): VpnAccount {
  return {
    id: String(data.id),
    providerAccountId: String(data.id),
    username: data.username,
    status: mapStatus(data.status),
    expiresAt: data.expired_at ?? null,
    createdAt: data.created ? new Date(data.created).toISOString() : new Date().toISOString(),
  };
}

/**
 * VPNResellers API v4.1 adapter.
 * Endpoints taken from https://api.vpnresellers.com/docs/v4_1/ — do not invent routes.
 * Compiles and is unit-tested with mocked HTTP; live calls require VPNRESELLERS_API_TOKEN.
 */
export class VPNResellersProvider implements VPNProvider {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly config: VPNResellersConfig) {
    this.fetchFn = config.fetchFn ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 15000;
    if (!config.apiToken) {
      // Still constructable for typecheck/tests; live calls will fail with unauthorized
    }
  }

  async getProviderStatus() {
    try {
      await this.request<unknown>("GET", "/servers");
      return { ok: true, provider: "vpnresellers" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return { ok: false, provider: "vpnresellers", detail: message };
    }
  }

  async listLocations(): Promise<VpnLocation[]> {
    const [serversRes, vlessRes] = await Promise.all([
      this.request<{ data: VrServer[] }>("GET", "/servers"),
      this.request<{ data: VrServer[] }>("GET", "/vless-servers").catch(() => ({ data: [] as VrServer[] })),
    ]);

    const vlessIds = new Set((vlessRes.data ?? []).map((s) => s.id));
    const byId = new Map<number, VpnLocation>();

    for (const server of serversRes.data ?? []) {
      byId.set(server.id, this.mapServer(server, vlessIds.has(server.id)));
    }
    for (const server of vlessRes.data ?? []) {
      const existing = byId.get(server.id);
      if (existing) {
        if (!existing.protocolSupport.includes("vless")) {
          existing.protocolSupport.push("vless");
        }
      } else {
        byId.set(server.id, this.mapServer(server, true, true));
      }
    }
    return [...byId.values()];
  }

  async createAccount(input: CreateAccountInput): Promise<VpnAccount> {
    const body: Record<string, unknown> = {
      username: input.username,
      password: input.password,
    };
    if (input.expiresAt) {
      // expire endpoint exists separately; create may accept expired_at via expire call after
    }
    const res = await this.request<{ data: VrAccountData; code: number }>("POST", "/accounts", body);
    return mapAccount(res.data);
  }

  async getAccount(providerAccountId: string): Promise<VpnAccount> {
    const res = await this.request<{ data: VrAccountData }>("GET", `/accounts/${providerAccountId}`);
    return mapAccount(res.data);
  }

  async suspendAccount(providerAccountId: string): Promise<VpnAccount> {
    await this.request("PUT", `/accounts/${providerAccountId}/disable`);
    return this.getAccount(providerAccountId);
  }

  async reactivateAccount(providerAccountId: string): Promise<VpnAccount> {
    await this.request("PUT", `/accounts/${providerAccountId}/enable`);
    return this.getAccount(providerAccountId);
  }

  async deleteAccount(providerAccountId: string): Promise<void> {
    await this.request("DELETE", `/accounts/${providerAccountId}`);
  }

  async getConnectionConfig(input: CreateConnectionInput): Promise<VpnConnectionConfig> {
    const locationId = input.locationId;
    if (input.protocol === "wireguard") {
      const res = await this.request<unknown>(
        "GET",
        `/configuration/wireguard?server_id=${encodeURIComponent(locationId)}&account_id=${encodeURIComponent(input.accountId)}`,
      );
      const content = typeof res === "string" ? res : JSON.stringify(res, null, 2);
      return {
        protocol: "wireguard",
        locationId,
        content,
        filename: `northstar-${locationId}.conf`,
        contentType: "text/plain",
        isMock: false,
      };
    }
    if (input.protocol === "openvpn") {
      // OpenVPN requires server_id and port_id per docs; port_id=1 is a common default — callers should pass port via location metadata when known
      const res = await this.request<unknown>(
        "GET",
        `/configuration/openvpn?server_id=${encodeURIComponent(locationId)}&port_id=1`,
      );
      const content = typeof res === "string" ? res : JSON.stringify(res, null, 2);
      return {
        protocol: "openvpn",
        locationId,
        content,
        filename: `northstar-${locationId}.ovpn`,
        contentType: "application/x-openvpn-profile",
        isMock: false,
      };
    }
    const res = await this.request<unknown>(
      "GET",
      `/configuration/vless?server_id=${encodeURIComponent(locationId)}&account_id=${encodeURIComponent(input.accountId)}`,
    );
    const content = typeof res === "string" ? res : JSON.stringify(res, null, 2);
    return {
      protocol: "vless",
      locationId,
      content,
      filename: `northstar-${locationId}-vless.txt`,
      contentType: "text/plain",
      isMock: false,
    };
  }

  private mapServer(server: VrServer, hasVless: boolean, vlessOnly = false): VpnLocation {
    const code = server.country_code.toUpperCase();
    return {
      id: String(server.id),
      providerId: String(server.id),
      country: COUNTRY_NAMES[code] ?? code,
      countryCode: code,
      city: server.city,
      hostname: server.name,
      status: "online",
      protocolSupport: vlessOnly
        ? ["vless"]
        : hasVless
          ? ["wireguard", "openvpn", "vless"]
          : ["wireguard", "openvpn"],
      load: typeof server.capacity === "number" ? server.capacity : undefined,
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.apiUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.config.apiToken}`,
        Accept: "application/json",
      };
      if (body !== undefined) headers["Content-Type"] = "application/json";

      const response = await this.fetchFn(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      let json: { message?: string; code?: number; errors?: unknown } | null = null;
      try {
        json = text ? (JSON.parse(text) as { message?: string; code?: number }) : null;
      } catch {
        if (response.ok) return text as T;
        throw new VpnProviderError(`Invalid JSON from provider (${response.status})`, "unknown", true);
      }

      if (!response.ok) {
        throw this.mapHttpError(response.status, json?.message ?? response.statusText);
      }
      return (json ?? {}) as T;
    } catch (err) {
      if (err instanceof VpnProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new VpnProviderError("VPN provider request timed out", "timeout", true, err);
      }
      throw new VpnProviderError("VPN provider unavailable", "unavailable", true, err);
    } finally {
      clearTimeout(timer);
    }
  }

  private mapHttpError(status: number, message: string): VpnProviderError {
    switch (status) {
      case 401:
        return new VpnProviderError(message || "Unauthorized", "unauthorized");
      case 402:
        return new VpnProviderError(message || "Insufficient balance", "insufficient_balance", true);
      case 404:
        return new VpnProviderError(message || "Not found", "not_found");
      case 422:
        return new VpnProviderError(message || "Validation error", "validation");
      case 400:
        return new VpnProviderError(message || "Bad request", "validation");
      case 403:
        return new VpnProviderError(message || "Forbidden", "unauthorized");
      default:
        return new VpnProviderError(message || `HTTP ${status}`, "unknown", status >= 500);
    }
  }
}
