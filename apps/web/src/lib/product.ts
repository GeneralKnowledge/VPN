import {
  PRODUCT_HEADER,
  appUrlForProduct,
  getBrand,
  isProduct,
  type BrandConfig,
  type Product,
} from "@northstar/config";
import { headers } from "next/headers";
import { getEnv } from "./providers";

/** Read product from middleware header (defaults to vpn). */
export async function getProduct(): Promise<Product> {
  const h = await headers();
  const raw = h.get(PRODUCT_HEADER);
  return isProduct(raw) ? raw : "vpn";
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
