import type { MetadataRoute } from "next";

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

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const lastModified = new Date();
  return routes.map((path) => ({
    url: new URL(path, base).toString(),
    lastModified,
    changeFrequency: path === "/" || path === "/pricing" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/pricing" ? 0.9 : 0.6,
  }));
}
