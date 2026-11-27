import type { MetadataRoute } from "next";
import { config } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  const base = config.appUrl;
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/*?ref="] },
      // AI crawlers are welcome on public pages (they drive referral traffic)
      { userAgent: ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"], allow: "/", disallow: ["/api/", "/admin"] },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
