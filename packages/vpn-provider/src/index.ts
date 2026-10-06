import { MockVPNProvider } from "./mock";
import type { VPNProvider, VPNProviderKind } from "./types";
import { VPNResellersProvider, type VPNResellersConfig } from "./vpnresellers";

export function createVPNProvider(
  kind: VPNProviderKind,
  options?: Partial<VPNResellersConfig>,
): VPNProvider {
  if (kind === "mock") {
    return new MockVPNProvider();
  }
  return new VPNResellersProvider({
    apiUrl: options?.apiUrl ?? "https://api.vpnresellers.com/v4_1",
    apiToken: options?.apiToken ?? "",
    timeoutMs: options?.timeoutMs,
    fetchFn: options?.fetchFn,
    projectId: options?.projectId,
  });
}

export * from "./types";
export { MockVPNProvider, MOCK_LOCATIONS } from "./mock";
export { VPNResellersProvider } from "./vpnresellers";
export type { VPNResellersConfig } from "./vpnresellers";
