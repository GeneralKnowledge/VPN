import type { MetadataRoute } from "next";
import { listDestinations } from "@northstar/destinations";
import { appUrl } from "@/lib/providers";
import { productFromRequestHost } from "@/lib/request-product";

/** Public marketing routes only — legal drafts are noindex and omitted. */
const routes = [
  "/",
  "/features",
  "/pricing",
  "/locations",
  "/how-it-works",
  "/download",
  "/support",
  "/about",
  "/trust",
  "/contact",
  "/login",
  "/register",
];

function travelSitemap(): MetadataRoute.Sitemap {
  const base = appUrl("travel");
  const lastModified = new Date();
  const paths = ["/", "/destinations", ...listDestinations().map((d) => `/destinations/${d.slug}`)];
  return paths.map((path) => ({
    url: new URL(path, base).toString(),
    lastModified,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if ((await productFromRequestHost()) === "travel") return travelSitemap();
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const lastModified = new Date();
  return routes.map((path) => ({
    url: new URL(path, base).toString(),
    lastModified,
    changeFrequency: path === "/" || path === "/pricing" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/pricing" ? 0.9 : 0.6,
  }));
}
