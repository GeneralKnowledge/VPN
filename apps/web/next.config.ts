import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Next.js only loads .env files from the app directory. The documented setup keeps a single
// .env at the monorepo root, so load it explicitly (app-level files still take precedence).
loadEnvConfig(path.resolve(__dirname, "../.."), process.env.NODE_ENV !== "production");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: [
    "@northstar/config",
    "@northstar/db",
    "@northstar/vpn-provider",
    "@northstar/billing",
    "@northstar/email",
  ],
  serverExternalPackages: ["better-sqlite3"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
