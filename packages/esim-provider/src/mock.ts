import type {
  CreateEsimOrderInput,
  EsimIssueResult,
  EsimPackage,
  EsimProvider,
} from "./types";
import { EsimProviderError } from "./types";

/** Lean fixture catalog — enough for browse → buy → QR in mock mode. */
export const MOCK_ESIM_PACKAGES: EsimPackage[] = [
  {
    code: "MOCK-GB-1GB-7D",
    name: "United Kingdom 1GB 7 Days",
    countryCode: "GB",
    countryName: "United Kingdom",
    dataVolume: "1 GB",
    validity: "7 days",
    price: 399,
    currency: "GBP",
  },
  {
    code: "MOCK-GB-3GB-30D",
    name: "United Kingdom 3GB 30 Days",
    countryCode: "GB",
    countryName: "United Kingdom",
    dataVolume: "3 GB",
    validity: "30 days",
    price: 799,
    currency: "GBP",
  },
  {
    code: "MOCK-EU-5GB-30D",
    name: "Europe 5GB 30 Days",
    countryCode: "EU",
    countryName: "Europe",
    dataVolume: "5 GB",
    validity: "30 days",
    price: 1299,
    currency: "GBP",
  },
  {
    code: "MOCK-US-1GB-7D",
    name: "United States 1GB 7 Days",
    countryCode: "US",
    countryName: "United States",
    dataVolume: "1 GB",
    validity: "7 days",
    price: 449,
    currency: "GBP",
  },
  {
    code: "MOCK-US-5GB-30D",
    name: "United States 5GB 30 Days",
    countryCode: "US",
    countryName: "United States",
    dataVolume: "5 GB",
    validity: "30 days",
    price: 1499,
    currency: "GBP",
  },
  {
    code: "MOCK-JP-3GB-15D",
    name: "Japan 3GB 15 Days",
    countryCode: "JP",
    countryName: "Japan",
    dataVolume: "3 GB",
    validity: "15 days",
    price: 999,
    currency: "GBP",
  },
];

export class MockEsimProvider implements EsimProvider {
  private orders = new Map<string, EsimIssueResult & { packageCode: string }>();
  private seq = 1;

  async getProviderStatus() {
    return { ok: true, provider: "mock", detail: `${MOCK_ESIM_PACKAGES.length} fixture packages` };
  }

  async listPackages(filter?: { country?: string }): Promise<EsimPackage[]> {
    if (!filter?.country) return [...MOCK_ESIM_PACKAGES];
    const code = filter.country.toUpperCase();
    return MOCK_ESIM_PACKAGES.filter((p) => p.countryCode === code);
  }

  async getPackage(packageCode: string): Promise<EsimPackage | null> {
    return MOCK_ESIM_PACKAGES.find((p) => p.code === packageCode) ?? null;
  }

  async createOrder(input: CreateEsimOrderInput): Promise<EsimIssueResult> {
    const pkg = await this.getPackage(input.packageCode);
    if (!pkg) {
      throw new EsimProviderError("Unknown package", "not_found", false, undefined, 404, "createOrder");
    }
    const id = `mock-esim-${this.seq++}`;
    // 1×1 PNG data URL — enough for dashboard <img> / e2e without a network fetch.
    const qrCodeUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const result: EsimIssueResult = {
      providerOrderId: id,
      packageCode: pkg.code,
      packageName: pkg.name,
      iccid: `8901${String(this.seq).padStart(15, "0")}`,
      qrCodeUrl,
      activationUrl: `LPA:1$mock.rsp.local$${id}`,
      status: "available",
    };
    this.orders.set(id, result);
    return result;
  }

  async getOrder(providerOrderId: string): Promise<EsimIssueResult | null> {
    return this.orders.get(providerOrderId) ?? null;
  }
}
