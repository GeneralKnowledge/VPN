import {
  PRODUCT_HEADER,
  VPN_ONLY_PREFIXES,
  productHostConfig,
  resolveProductFromHost,
  type Product,
} from "@northstar/config";
import { NextResponse, type NextRequest } from "next/server";

/** Marketing paths rewritten to /sim/* on the eSIM host. */
const ESIM_MARKETING = new Set([
  "/",
  "/pricing",
  "/how-it-works",
  "/about",
  "/support",
  "/contact",
  "/trust",
  "/privacy",
  "/terms",
  "/acceptable-use",
  "/refund",
  "/cookies",
]);

function requestHost(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-host") ?? req.headers.get("host");
}

function withProduct(res: NextResponse, product: Product): NextResponse {
  res.headers.set(PRODUCT_HEADER, product);
  return res;
}

function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(req: NextRequest) {
  const host = requestHost(req);
  const config = productHostConfig({
    PRODUCT_HOST_VPN: process.env.PRODUCT_HOST_VPN ?? "",
    PRODUCT_HOST_ESIM: process.env.PRODUCT_HOST_ESIM ?? "sim.localhost,sim.example.com",
  });
  const product = resolveProductFromHost(host, config);
  const { pathname } = req.nextUrl;

  // Skip static / Next internals (matcher also limits this).
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return withProduct(NextResponse.next(), product);
  }

  if (product === "esim") {
    // Admin stays on the VPN host only.
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      const vpnBase = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
      return NextResponse.redirect(new URL(`/admin${pathname.slice("/admin".length)}`, vpnBase));
    }

    if (startsWithAny(pathname, VPN_ONLY_PREFIXES)) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      return withProduct(NextResponse.redirect(url), product);
    }

    // Avoid double-prefix if already under /sim
    if (pathname === "/sim" || pathname.startsWith("/sim/")) {
      return withProduct(NextResponse.next(), product);
    }

    if (ESIM_MARKETING.has(pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = pathname === "/" ? "/sim" : `/sim${pathname}`;
      return withProduct(NextResponse.rewrite(url), product);
    }

    return withProduct(NextResponse.next(), product);
  }

  // VPN host: hide internal /sim marketing tree from direct browsing.
  if (pathname === "/sim" || pathname.startsWith("/sim/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return withProduct(NextResponse.redirect(url), product);
  }

  if (pathname === "/dashboard/esim" || pathname.startsWith("/dashboard/esim/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return withProduct(NextResponse.redirect(url), product);
  }

  return withProduct(NextResponse.next(), product);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
