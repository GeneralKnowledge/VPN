import {
  PRODUCT_HEADER,
  appUrlForProduct,
  getBrand,
  isProduct,
  type BrandConfig,
  type Product,
} from "@northstar/config";
import { headers } from "next/headers";
import { HttpError } from "./http";
import { getEnv } from "./providers";

/** Read product from middleware-forwarded request header (defaults to vpn). */
export async function getProduct(): Promise<Product> {
  const h = await headers();
  const raw = h.get(PRODUCT_HEADER);
  return isProduct(raw) ? raw : "vpn";
}

/** Refuse the request unless it is on the expected product host. */
export async function requireProduct(expected: Product): Promise<Product> {
  const product = await getProduct();
  if (product !== expected) {
    throw new HttpError(404, "Not available on this host");
  }
  return product;
}

export async function getProductBrand(): Promise<BrandConfig> {
  return getBrand(await getProduct());
}

export async function productAppUrl(product?: Product): Promise<string> {
  const p = product ?? (await getProduct());
  return appUrlForProduct(getEnv(), p);
}

export function formatMoney(amountPence: number, currency = "GBP"): string {
  const major = (amountPence / 100).toFixed(2);
  if (currency === "GBP") return `£${major}`;
  return `${major} ${currency}`;
}
