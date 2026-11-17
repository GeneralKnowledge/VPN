import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/providers";
import { productFromRequestHost } from "@/lib/request-product";

export default async function robots(): Promise<MetadataRoute.Robots> {
  if ((await productFromRequestHost()) === "travel") {
    const base = appUrl("travel");
    return {
      rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
      sitemap: new URL("/sitemap.xml", base).toString(),
    };
  }
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/admin/",
          "/api/",
          "/billing/",
          "/privacy",
          "/terms",
          "/acceptable-use",
          "/refund",
          "/cookies",
        ],
      },
    ],
    sitemap: new URL("/sitemap.xml", base).toString(),
  };
}
