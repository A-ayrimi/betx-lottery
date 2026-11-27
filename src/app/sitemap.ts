import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";
import { config } from "@/lib/config";

/** All public, indexable routes across every locale (plus hreflang alternates). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = config.appUrl;
  const now = new Date();
  const pages: { path: string; priority: number; freq: "hourly" | "weekly" | "monthly" }[] = [
    { path: "", priority: 1, freq: "hourly" },
    { path: "/install", priority: 0.8, freq: "monthly" },
    { path: "/verify", priority: 0.7, freq: "hourly" },
    { path: "/responsible-gaming", priority: 0.5, freq: "monthly" },
    { path: "/terms", priority: 0.4, freq: "monthly" },
    { path: "/privacy", priority: 0.4, freq: "monthly" },
  ];
  return pages.flatMap(({ path, priority, freq }) =>
    locales.map((l) => ({
      url: `${base}/${l}${path}`,
      lastModified: now,
      changeFrequency: freq,
      priority,
      alternates: { languages: Object.fromEntries(locales.map((x) => [x, `${base}/${x}${path}`])) },
    })),
  );
}
