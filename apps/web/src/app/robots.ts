import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
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
