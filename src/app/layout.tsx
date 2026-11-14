import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Script from "next/script";
// self-hosted fonts: no build-time dependency on Google Fonts
import "@fontsource-variable/vazirmatn";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/manrope";
import "./globals.css";
import { defaultLocale, dirOf, isLocale } from "@/i18n/config";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  // Titles are fully composed per page (each dictionary already ends with “| BETX”).
  title: "BETX | One ticket. One chance. Instant USDT wins.",
  description:
    "BETX lucky pool: $1 tickets, 20-ticket provably-fair draws, a free daily wheel and instant USDT-TRC20 payouts.",
  applicationName: "BETX",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "BETX", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "64x64", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.png"],
  },
  referrer: "strict-origin-when-cross-origin",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#060a09" },
    { media: "(prefers-color-scheme: light)", color: "#060a09" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const h = await headers();
  const fromProxy = h.get("x-betx-locale");
  const locale = isLocale(fromProxy) ? fromProxy : defaultLocale;

  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body className="min-h-screen antialiased">
        {children}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
