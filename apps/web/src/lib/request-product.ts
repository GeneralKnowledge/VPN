import { productHostConfig, resolveProductFromHost, resolveRequestHost, type Product } from "@northstar/config";
import { headers } from "next/headers";

/**
 * Product for routes the middleware doesn't see (it skips paths with a dot, such as sitemap.xml
 * and robots.txt), resolved from the Host header with the same env and rules as the middleware.
 */
export async function productFromRequestHost(): Promise<Product> {
  const requestHeaders = await headers();
  const host = resolveRequestHost(requestHeaders, {
    trustForwardedHost: process.env.TRUST_FORWARDED_HOST === "true",
  });
  return resolveProductFromHost(
    host,
    productHostConfig({
      PRODUCT_HOST_VPN: process.env.PRODUCT_HOST_VPN ?? "",
      PRODUCT_HOST_ESIM: process.env.PRODUCT_HOST_ESIM ?? "sim.localhost,sim.example.com",
      PRODUCT_HOST_TRAVEL: process.env.PRODUCT_HOST_TRAVEL ?? "travel.localhost,travel.example.com",
    }),
  );
}
