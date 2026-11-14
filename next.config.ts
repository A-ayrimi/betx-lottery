import type { NextConfig } from "next";

const frameAncestors = process.env.FRAME_ANCESTORS?.trim();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Allow embedding in preview iframes (Arena/E2B) and Telegram Mini App by default;
  // set FRAME_ANCESTORS in production if you want to restrict framing to specific origins.
  ...(frameAncestors ? [{ key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors}` }] : []),
];

const nextConfig: NextConfig = {
  // tronweb is server-only (signature checks, tx building) — keep it out of the bundle
  serverExternalPackages: ["tronweb"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // the service worker must always be revalidated so new deploys take effect
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
