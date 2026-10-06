import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@northstar/config",
    "@northstar/db",
    "@northstar/vpn-provider",
    "@northstar/billing",
    "@northstar/email",
  ],
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
