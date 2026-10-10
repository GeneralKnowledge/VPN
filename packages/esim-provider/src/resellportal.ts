import type {
  CreateEsimOrderInput,
  EsimIssueResult,
  EsimPackage,
  EsimProvider,
  EsimProfileStatus,
} from "./types";
import { EsimProviderError } from "./types";

export interface ResellPortalConfig {
  apiUrl: string;
  apiKey: string;
  apiSecret: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  /** Markup multiplier from wholesale USD-ish amounts into GBP pence display (mock retail). */
  retailMarkup?: number;
}

type RawPackage = {
  package_code?: string;
  code?: string;
  name?: string;
  location?: string;
  country_code?: string;
  data_volume?: string;
  validity?: string;
  price?: number | string;
  amount?: number | string;
};

/**
 * ResellPortal eSIM API adapter.
 * Docs: https://resellportal.com/esim-api/
 */
export class ResellPortalEsimProvider implements EsimProvider {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly config: ResellPortalConfig) {
    this.fetchFn = config.fetchFn ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 15000;
  }

  async getProviderStatus() {
    try {
      await this.listPackages();
      return { ok: true, provider: "resellportal" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "unavailable";
      return { ok: false, provider: "resellportal", detail: message };
    }
  }

  async listPackages(filter?: { country?: string }): Promise<EsimPackage[]> {
    const qs = filter?.country ? `?location=${encodeURIComponent(filter.country)}` : "";
    const raw = await this.request<unknown>("GET", `/esim-packages${qs}`);
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { data?: unknown }).data)
        ? ((raw as { data: RawPackage[] }).data)
        : Array.isArray((raw as { packages?: unknown }).packages)
          ? ((raw as { packages: RawPackage[] }).packages)
          : [];
    return list.map((p) => this.mapPackage(p)).filter((p): p is EsimPackage => Boolean(p));
  }

  async getPackage(packageCode: string): Promise<EsimPackage | null> {
    const all = await this.listPackages();
    return all.find((p) => p.code === packageCode) ?? null;
  }

  async createOrder(input: CreateEsimOrderInput): Promise<EsimIssueResult> {
    // ResellPortal expects a numeric client_id from POST /clients. For lean launch we send
    // email + package and let the adapter create/reuse a client when the API supports it.
    const clientId = await this.ensureClient(input);
    const raw = await this.request<Record<string, unknown>>("POST", "/orders", {
      client_id: clientId,
      product_key: "esim",
      package_code: input.packageCode,
    });
    return this.mapIssue(raw, input.packageCode);
  }

  async getOrder(providerOrderId: string): Promise<EsimIssueResult | null> {
    try {
      const raw = await this.request<Record<string, unknown>>("GET", `/orders/${providerOrderId}`);
      return this.mapIssue(raw, String((raw as { package_code?: string }).package_code ?? ""));
    } catch (err) {
      if (err instanceof EsimProviderError && err.code === "not_found") return null;
      throw err;
    }
  }

  private async ensureClient(input: CreateEsimOrderInput): Promise<number | string> {
    // Prefer creating a lightweight client; if the API rejects, fall back to clientRef hash.
    try {
      const raw = await this.request<Record<string, unknown>>("POST", "/clients", {
        email: input.email,
        first_name: input.firstName ?? "Customer",
        last_name: input.lastName ?? input.clientRef.slice(0, 8),
      });
      const id = (raw as { client_id?: number; id?: number }).client_id ?? (raw as { id?: number }).id;
      if (id != null) return id;
    } catch {
      // Some accounts reuse clients by email via list — ignore and use synthetic id.
    }
    return input.clientRef;
  }

  private mapPackage(p: RawPackage): EsimPackage | null {
    const code = p.package_code ?? p.code;
    if (!code) return null;
    const countryCode = (p.country_code ?? p.location ?? "XX").toString().toUpperCase();
    const wholesale = Number(p.price ?? p.amount ?? 0);
    const markup = this.config.retailMarkup ?? 1.4;
    const pricePence = Number.isFinite(wholesale)
      ? Math.max(99, Math.round(wholesale * 100 * markup))
      : 999;
    return {
      code,
      name: p.name ?? code,
      countryCode,
      countryName: countryCode,
      dataVolume: p.data_volume ?? "",
      validity: p.validity ?? "",
      price: pricePence,
      currency: "GBP",
    };
  }

  private mapIssue(raw: Record<string, unknown>, fallbackCode: string): EsimIssueResult {
    const details = (raw.esim_details ?? raw.esimDetails ?? {}) as Record<string, unknown>;
    const pkg = (raw.package ?? {}) as Record<string, unknown>;
    const statusRaw = String(details.esim_status ?? details.status ?? "AVAILABLE").toLowerCase();
    let status: EsimProfileStatus = "unknown";
    if (statusRaw.includes("avail")) status = "available";
    else if (statusRaw.includes("install")) status = "installed";
    else if (statusRaw.includes("expir")) status = "expired";

    const providerOrderId = String(
      raw.service_id ?? raw.order_id ?? raw.id ?? details.iccid ?? "unknown",
    );
    return {
      providerOrderId,
      packageCode: String(pkg.code ?? raw.package_code ?? fallbackCode),
      packageName: String(pkg.name ?? raw.package_name ?? fallbackCode),
      iccid: details.iccid != null ? String(details.iccid) : null,
      qrCodeUrl: details.qr_code_url != null ? String(details.qr_code_url) : null,
      activationUrl: details.activation_url != null ? String(details.activation_url) : null,
      status,
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.config.apiKey || !this.config.apiSecret) {
      throw new EsimProviderError(
        "ResellPortal credentials missing",
        "unauthorized",
        false,
        undefined,
        401,
        path,
      );
    }
    const url = `${this.config.apiUrl.replace(/\/$/, "")}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(url, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-API-Key": this.config.apiKey,
          "X-API-Secret": this.config.apiSecret,
        },
        body: body != null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        throw this.mapError(res.status, path, json);
      }
      return json as T;
    } catch (err) {
      if (err instanceof EsimProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new EsimProviderError("Request timed out", "timeout", true, err, undefined, path);
      }
      throw new EsimProviderError("Provider unavailable", "unavailable", true, err, undefined, path);
    } finally {
      clearTimeout(timer);
    }
  }

  private mapError(status: number, operation: string, body: unknown): EsimProviderError {
    const msg =
      typeof body === "object" && body && "message" in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${status}`;
    if (status === 401 || status === 403) {
      return new EsimProviderError(msg, "unauthorized", false, body, status, operation);
    }
    if (status === 404) return new EsimProviderError(msg, "not_found", false, body, status, operation);
    if (status === 402) {
      return new EsimProviderError(msg, "insufficient_balance", true, body, status, operation);
    }
    if (status === 409) return new EsimProviderError(msg, "conflict", false, body, status, operation);
    if (status === 422 || status === 400) {
      return new EsimProviderError(msg, "validation", false, body, status, operation);
    }
    if (status === 429) {
      return new EsimProviderError(msg, "rate_limited", true, body, status, operation);
    }
    if (status >= 500) {
      return new EsimProviderError(msg, "unknown", true, body, status, operation);
    }
    return new EsimProviderError(msg, "unknown", false, body, status, operation);
  }
}
