import type {
  CreateAccountInput,
  CreateConnectionInput,
  VpnAccount,
  VpnAccountStatus,
  VpnConnectionConfig,
  VpnLocation,
  VpnProtocol,
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
  // WireGuard keys may appear in responses — never log them
  wg_private_key?: string;
  wg_public_key?: string;
  wg_ip?: string;
}

interface VrServer {
  id: number;
  name: string;
  ip: string;
  country_code: string;
  city: string;
  capacity?: number;
}

interface VrPort {
  id: number;
  protocol: string;
  number: number;
  default?: number;
}

interface Paginated<T> {
  data?: T[];
  meta?: { current_page?: number; last_page?: number };
  links?: { next?: string | null };
  code?: number;
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
  ES: "Spain",
  IT: "Italy",
  PL: "Poland",
  IE: "Ireland",
  NO: "Norway",
  FI: "Finland",
  DK: "Denmark",
  AT: "Austria",
  BE: "Belgium",
  PT: "Portugal",
  BR: "Brazil",
  MX: "Mexico",
  IN: "India",
  KR: "South Korea",
  HK: "Hong Kong",
  NZ: "New Zealand",
};

function mapStatus(status: string): VpnAccountStatus {
  const s = status.toLowerCase();
  if (s === "active") return "active";
  if (s === "disabled" || s === "disable") return "disabled";
  if (s === "expired") return "expired";
  return "pending";
}

function mapAccount(data: VrAccountData, customerExternalId?: string): VpnAccount {
  return {
    id: String(data.id),
    providerAccountId: String(data.id),
    username: data.username,
    status: mapStatus(data.status),
    customerExternalId,
    expiresAt: data.expired_at ?? null,
    createdAt: data.created ? new Date(data.created).toISOString() : new Date().toISOString(),
  };
}

function toExpireDate(isoOrDate: string): string {
  // API expects Y-m-d
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) throw new VpnProviderError("Invalid expiresAt", "validation");
  return d.toISOString().slice(0, 10);
}

function configContent(res: unknown): string {
  if (typeof res === "string") return res;
  if (res && typeof res === "object") {
    const obj = res as Record<string, unknown>;
    if (typeof obj.data === "string") return obj.data;
    if (obj.data && typeof obj.data === "object" && "content" in (obj.data as object)) {
      const content = (obj.data as { content?: unknown }).content;
      if (typeof content === "string") return content;
    }
    if (typeof obj.config === "string") return obj.config;
  }
  return JSON.stringify(res, null, 2);
}

/**
 * VPNResellers API v4.1 adapter.
 * Endpoints from https://api.vpnresellers.com/docs/v4_1/ — do not invent routes.
 */
export class VPNResellersProvider implements VPNProvider {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private defaultOpenVpnPortId: number | null = null;

  constructor(private readonly config: VPNResellersConfig) {
    this.fetchFn = config.fetchFn ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 15000;
  }

  async getProviderStatus() {
    try {
      await this.request<unknown>("GET", "/servers?page=1&per_page=1", undefined, "getProviderStatus");
      return { ok: true, provider: "vpnresellers" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return { ok: false, provider: "vpnresellers", detail: message };
    }
  }

  async listLocations(): Promise<VpnLocation[]> {
    const [servers, vlessServers] = await Promise.all([
      this.fetchAllPages<VrServer>("/servers", "listLocations"),
      this.fetchAllPages<VrServer>("/vless-servers", "listLocations").catch(() => [] as VrServer[]),
    ]);

    const vlessIds = new Set(vlessServers.map((s) => s.id));
    const byId = new Map<number, VpnLocation>();

    for (const server of servers) {
      byId.set(server.id, this.mapServer(server, vlessIds.has(server.id)));
    }
    for (const server of vlessServers) {
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

    if (input.email && this.config.projectId != null) {
      body.customer = {
        first_name: input.firstName ?? "Northstar",
        last_name: input.lastName ?? "Customer",
        email: input.email,
        project_id: this.config.projectId,
      };
    }

    let account: VpnAccount;
    try {
      const res = await this.request<{ data: VrAccountData; code: number }>(
        "POST",
        "/accounts",
        body,
        "createAccount",
      );
      account = mapAccount(res.data, input.externalCustomerId);
    } catch (err) {
      if (err instanceof VpnProviderError && (err.code === "conflict" || err.code === "validation")) {
        const existing = await this.findAccountByUsername(input.username);
        if (existing) return existing;
      }
      throw err;
    }

    if (input.expiresAt) {
      try {
        await this.request(
          "PUT",
          `/accounts/${account.providerAccountId}/expire`,
          { expire_at: toExpireDate(input.expiresAt) },
          "expireAccount",
        );
        account = await this.getAccount(account.providerAccountId);
      } catch {
        // Account exists; expire can be retried via reconcile
      }
    }

    return account;
  }

  async getAccount(providerAccountId: string): Promise<VpnAccount> {
    const res = await this.request<{ data: VrAccountData }>(
      "GET",
      `/accounts/${providerAccountId}`,
      undefined,
      "getAccount",
    );
    return mapAccount(res.data);
  }

  async findAccountByUsername(username: string): Promise<VpnAccount | null> {
    // Prefer filtered list when supported; fall back to scanning pages.
    const filtered = await this.request<Paginated<VrAccountData>>(
      "GET",
      `/accounts?username=${encodeURIComponent(username)}&per_page=50`,
      undefined,
      "findAccountByUsername",
    ).catch(() => null);

    const fromFilter = (filtered?.data ?? []).find((a) => a.username === username);
    if (fromFilter) return mapAccount(fromFilter);

    const all = await this.fetchAllPages<VrAccountData>("/accounts", "findAccountByUsername");
    const match = all.find((a) => a.username === username);
    return match ? mapAccount(match) : null;
  }

  async suspendAccount(providerAccountId: string): Promise<VpnAccount> {
    await this.request("PUT", `/accounts/${providerAccountId}/disable`, undefined, "suspendAccount");
    return this.getAccount(providerAccountId);
  }

  async reactivateAccount(providerAccountId: string): Promise<VpnAccount> {
    await this.request("PUT", `/accounts/${providerAccountId}/enable`, undefined, "reactivateAccount");
    return this.getAccount(providerAccountId);
  }

  async deleteAccount(providerAccountId: string): Promise<void> {
    await this.request("DELETE", `/accounts/${providerAccountId}`, undefined, "deleteAccount");
  }

  async getConnectionConfig(input: CreateConnectionInput): Promise<VpnConnectionConfig> {
    const serverId = input.locationId;
    const accountId = input.accountId;
    const protocol = input.protocol;

    if (protocol === "wireguard") {
      const res = await this.requestConfig(
        `/configuration/wireguard?server_id=${encodeURIComponent(serverId)}&account_id=${encodeURIComponent(accountId)}`,
        "getConnectionConfig",
      );
      return {
        protocol: "wireguard",
        locationId: serverId,
        content: configContent(res),
        filename: `northstar-${serverId}.conf`,
        contentType: "text/plain",
        isMock: false,
      };
    }

    if (protocol === "openvpn") {
      const portId = await this.resolveOpenVpnPortId();
      const res = await this.requestConfig(
        `/configuration/openvpn?server_id=${encodeURIComponent(serverId)}&port_id=${portId}`,
        "getConnectionConfig",
      );
      return {
        protocol: "openvpn",
        locationId: serverId,
        content: configContent(res),
        filename: `northstar-${serverId}.ovpn`,
        contentType: "application/x-openvpn-profile",
        isMock: false,
      };
    }

    const res = await this.requestConfig(
      `/configuration/vless?server_id=${encodeURIComponent(serverId)}&account_id=${encodeURIComponent(accountId)}`,
      "getConnectionConfig",
    );
    return {
      protocol: "vless",
      locationId: serverId,
      content: configContent(res),
      filename: `northstar-${serverId}-vless.txt`,
      contentType: "text/plain",
      isMock: false,
    };
  }

  private async resolveOpenVpnPortId(): Promise<number> {
    if (this.defaultOpenVpnPortId != null) return this.defaultOpenVpnPortId;
    const res = await this.request<{ data: VrPort[] }>("GET", "/ports", undefined, "listPorts");
    const ports = res.data ?? [];
    const preferred = ports.find((p) => p.default === 1) ?? ports[0];
    if (!preferred) {
      throw new VpnProviderError("No OpenVPN ports available", "not_found", false, undefined, 404, "listPorts");
    }
    this.defaultOpenVpnPortId = preferred.id;
    return preferred.id;
  }

  private mapServer(server: VrServer, hasVless: boolean, vlessOnly = false): VpnLocation {
    const code = (server.country_code ?? "").toUpperCase();
    const protocols: VpnProtocol[] = vlessOnly
      ? ["vless"]
      : hasVless
        ? ["wireguard", "openvpn", "vless"]
        : ["wireguard", "openvpn"];
    return {
      id: String(server.id),
      providerId: String(server.id),
      country: COUNTRY_NAMES[code] ?? (code || "Unknown"),
      countryCode: code || "XX",
      city: server.city || server.name,
      hostname: server.name || server.ip,
      status: "online",
      protocolSupport: protocols,
      load: typeof server.capacity === "number" ? server.capacity : undefined,
    };
  }

  private async fetchAllPages<T>(path: string, operation: string): Promise<T[]> {
    const items: T[] = [];
    let page = 1;
    let lastPage = 1;
    const separator = path.includes("?") ? "&" : "?";

    do {
      const res = await this.request<Paginated<T>>(
        "GET",
        `${path}${separator}page=${page}&per_page=100`,
        undefined,
        operation,
      );
      const batch = Array.isArray(res.data) ? res.data : [];
      items.push(...batch);
      const reportedLast =
        typeof res.meta?.last_page === "number"
          ? res.meta.last_page
          : typeof (res as { last_page?: number }).last_page === "number"
            ? (res as { last_page: number }).last_page
            : page;
      lastPage = reportedLast;
      // Stop if a page returns fewer items than requested and no last_page (defensive)
      if (!res.meta?.last_page && batch.length === 0) break;
      page += 1;
    } while (page <= lastPage && page <= 50);

    return items;
  }

  private async requestConfig(path: string, operation: string): Promise<unknown> {
    // Prefer JSON; fall back to file download Accept if needed
    try {
      return await this.request<unknown>("GET", path, undefined, operation, "application/json");
    } catch (err) {
      if (err instanceof VpnProviderError && err.httpStatus === 406) {
        return this.request<unknown>("GET", path, undefined, operation, "text/html; charset=UTF-8");
      }
      // Some responses return plain text with application/json Accept already handled
      throw err;
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    operation = "request",
    accept = "application/json",
  ): Promise<T> {
    const url = `${this.config.apiUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.config.apiToken}`,
        Accept: accept,
      };
      if (body !== undefined) headers["Content-Type"] = "application/json";

      const response = await this.fetchFn(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      let json: {
        message?: string;
        code?: number;
        errors?: Record<string, string[]>;
        data?: unknown;
      } | null = null;
      try {
        json = text ? (JSON.parse(text) as typeof json) : null;
      } catch {
        if (response.ok) return text as T;
        throw new VpnProviderError(
          `Invalid JSON from provider (${response.status})`,
          "unknown",
          true,
          undefined,
          response.status,
          operation,
        );
      }

      if (!response.ok) {
        throw this.mapHttpError(response.status, json, operation);
      }
      return (json ?? {}) as T;
    } catch (err) {
      if (err instanceof VpnProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new VpnProviderError("VPN provider request timed out", "timeout", true, err, undefined, operation);
      }
      throw new VpnProviderError("VPN provider unavailable", "unavailable", true, err, undefined, operation);
    } finally {
      clearTimeout(timer);
    }
  }

  private mapHttpError(
    status: number,
    json: { message?: string; errors?: Record<string, string[]> } | null,
    operation: string,
  ): VpnProviderError {
    const message = json?.message || `HTTP ${status}`;
    const usernameTaken = Boolean(
      json?.errors?.username?.some((e) => /taken|already|exist/i.test(e)) ||
        /already been taken|already exists|username.*taken/i.test(message),
    );

    if (status === 401 || status === 403) {
      return new VpnProviderError(message || "Unauthorized", "unauthorized", false, undefined, status, operation);
    }
    if (status === 402) {
      return new VpnProviderError(message || "Insufficient balance", "insufficient_balance", true, undefined, status, operation);
    }
    if (status === 404) {
      return new VpnProviderError(message || "Not found", "not_found", false, undefined, status, operation);
    }
    if (status === 409 || usernameTaken) {
      return new VpnProviderError(message || "Conflict", "conflict", false, undefined, status, operation);
    }
    if (status === 429) {
      return new VpnProviderError(message || "Rate limited", "rate_limited", true, undefined, status, operation);
    }
    if (status === 400 || status === 422) {
      return new VpnProviderError(message || "Validation error", "validation", false, undefined, status, operation);
    }
    if (status >= 500) {
      return new VpnProviderError(message || `HTTP ${status}`, "unknown", true, undefined, status, operation);
    }
    return new VpnProviderError(message || `HTTP ${status}`, "unknown", false, undefined, status, operation);
  }
}
