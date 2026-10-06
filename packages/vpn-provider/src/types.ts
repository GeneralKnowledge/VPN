import { z } from "zod";

export const protocolSchema = z.enum(["wireguard", "openvpn", "vless"]);
export type VpnProtocol = z.infer<typeof protocolSchema>;

export const locationStatusSchema = z.enum(["online", "maintenance", "offline"]);
export type LocationStatus = z.infer<typeof locationStatusSchema>;

export const accountStatusSchema = z.enum(["active", "disabled", "expired", "pending"]);
export type VpnAccountStatus = z.infer<typeof accountStatusSchema>;

export interface VpnLocation {
  id: string;
  providerId: string;
  country: string;
  countryCode: string;
  city: string;
  region?: string;
  hostname: string;
  status: LocationStatus;
  protocolSupport: VpnProtocol[];
  /** Optional estimated latency ms — mock/fixture only unless from provider */
  latency?: number;
  /** Optional load 0–100 — mock/fixture only unless from provider */
  load?: number;
}

export interface VpnAccount {
  id: string;
  providerAccountId: string;
  username: string;
  status: VpnAccountStatus;
  customerExternalId?: string;
  expiresAt?: string | null;
  createdAt: string;
}

export interface VpnConnectionConfig {
  protocol: VpnProtocol;
  locationId: string;
  /** Config body — mock configs are clearly marked */
  content: string;
  filename: string;
  contentType: string;
  isMock: boolean;
}

export interface CreateAccountInput {
  username: string;
  password: string;
  /** Our internal user id for correlation */
  externalCustomerId: string;
  expiresAt?: string;
}

export interface CreateConnectionInput {
  accountId: string;
  locationId: string;
  protocol: VpnProtocol;
  name?: string;
}

export class VpnProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "unauthorized"
      | "not_found"
      | "validation"
      | "insufficient_balance"
      | "timeout"
      | "unavailable"
      | "conflict"
      | "unknown",
    public readonly retryable = false,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "VpnProviderError";
  }
}

/**
 * Application-facing VPN infrastructure contract.
 * Implementations: MockVPNProvider, VPNResellersProvider.
 * The rest of the app must not know which vendor is behind this.
 */
export interface VPNProvider {
  getProviderStatus(): Promise<{ ok: boolean; provider: string; detail?: string }>;
  listLocations(): Promise<VpnLocation[]>;
  createAccount(input: CreateAccountInput): Promise<VpnAccount>;
  getAccount(providerAccountId: string): Promise<VpnAccount>;
  suspendAccount(providerAccountId: string): Promise<VpnAccount>;
  reactivateAccount(providerAccountId: string): Promise<VpnAccount>;
  deleteAccount(providerAccountId: string): Promise<void>;
  /** Generate downloadable connection configuration for a location/protocol */
  getConnectionConfig(input: CreateConnectionInput): Promise<VpnConnectionConfig>;
}

export type VPNProviderKind = "mock" | "vpnresellers";
