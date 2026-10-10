import { MockEsimProvider } from "./mock";
import { ResellPortalEsimProvider, type ResellPortalConfig } from "./resellportal";
import type { EsimProvider, EsimProviderKind } from "./types";

export function createEsimProvider(
  kind: EsimProviderKind,
  options?: Partial<ResellPortalConfig>,
): EsimProvider {
  if (kind === "mock") {
    return new MockEsimProvider();
  }
  return new ResellPortalEsimProvider({
    apiUrl: options?.apiUrl ?? "https://panel.resellportal.com/wp-json/resellportal/v1",
    apiKey: options?.apiKey ?? "",
    apiSecret: options?.apiSecret ?? "",
    timeoutMs: options?.timeoutMs,
    fetchFn: options?.fetchFn,
    retailMarkup: options?.retailMarkup,
  });
}

export {
  CUSTOMER_ESIM_ERROR,
  CUSTOMER_ESIM_ISSUE_ERROR,
  EsimProviderError,
} from "./types";

export * from "./types";
export { MockEsimProvider, MOCK_ESIM_PACKAGES } from "./mock";
export { ResellPortalEsimProvider } from "./resellportal";
export type { ResellPortalConfig } from "./resellportal";
