import type { MetadataRoute } from "next";

/** Web App Manifest: makes BETX installable on Android, iOS, Windows, macOS, Linux. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BETX — Lucky Pool",
    short_name: "BETX",
    description:
      "BETX lucky pool: $1 tickets, 20-ticket provably-fair draws with administrator review, a free daily wheel and reviewed USDT-TRC20 withdrawals.",
    id: "/en",
    start_url: "/en?utm_source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait-primary",
    background_color: "#060a09",
    theme_color: "#060a09",
    lang: "en",
    dir: "ltr",
    categories: ["games", "entertainment", "finance"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Lucky pool", short_name: "Pool", url: "/en#pool", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Daily wheel", short_name: "Wheel", url: "/en#wheel", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Wallet", short_name: "Wallet", url: "/en#wallet", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
