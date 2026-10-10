import {
  PRODUCT_HEADER,
  VPN_ONLY_PREFIXES,
  productHostConfig,
  resolveProductFromHost,
  resolveRequestHost,
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

function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Forward product on the *request* so `headers()` / getProduct() see it; never trust client value. */
function nextWithProduct(req: NextRequest, product: Product): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(PRODUCT_HEADER, product);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set(PRODUCT_HEADER, product);
  return res;
}

function rewriteWithProduct(req: NextRequest, product: Product, url: URL): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(PRODUCT_HEADER, product);
  const res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  res.headers.set(PRODUCT_HEADER, product);
  return res;
}

function redirectWithProduct(req: NextRequest, product: Product, url: URL): NextResponse {
  const res = NextResponse.redirect(url);
  res.headers.set(PRODUCT_HEADER, product);
  return res;
}

export function middleware(req: NextRequest) {
  const trustForwardedHost = process.env.TRUST_FORWARDED_HOST === "true";
  const host = resolveRequestHost(req.headers, { trustForwardedHost });
  const config = productHostConfig({
    PRODUCT_HOST_VPN: process.env.PRODUCT_HOST_VPN ?? "",
    PRODUCT_HOST_ESIM: process.env.PRODUCT_HOST_ESIM ?? "sim.localhost,sim.example.com",
  });
  const product = resolveProductFromHost(host, config);
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return nextWithProduct(req, product);
  }

  if (product === "esim") {
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      const vpnBase = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
      return NextResponse.redirect(new URL(`/admin${pathname.slice("/admin".length)}`, vpnBase));
    }

    // Admin/reconcile APIs must not be callable from the eSIM host.
    if (
      pathname === "/api/admin" ||
      pathname.startsWith("/api/admin/") ||
      pathname === "/api/reconcile"
    ) {
      return NextResponse.json({ error: "Not available on this host" }, { status: 404 });
    }

    if (startsWithAny(pathname, VPN_ONLY_PREFIXES)) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      return redirectWithProduct(req, product, url);
    }

    if (pathname === "/sim" || pathname.startsWith("/sim/")) {
      return nextWithProduct(req, product);
    }

    if (ESIM_MARKETING.has(pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = pathname === "/" ? "/sim" : `/sim${pathname}`;
      return rewriteWithProduct(req, product, url);
    }

    return nextWithProduct(req, product);
  }

  if (pathname === "/sim" || pathname.startsWith("/sim/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return redirectWithProduct(req, product, url);
  }

  if (pathname === "/dashboard/esim" || pathname.startsWith("/dashboard/esim/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return redirectWithProduct(req, product, url);
  }

  return nextWithProduct(req, product);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
