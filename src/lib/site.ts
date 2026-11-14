import type { Metadata } from "next";
import { locales, type Locale, intlTags } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { config } from "@/lib/config";

export const baseUrl = () => config.appUrl;

export const ogImage = "/og.png";

/** Canonical + hreflang map for a localized path ("/", "/terms", …). */
export function alternatesFor(locale: Locale, path = "/") {
  const base = baseUrl();
  const clean = path === "/" ? "" : path;
  return {
    canonical: `/${locale}${clean}`,
    languages: {
      ...Object.fromEntries(locales.map((l) => [intlTags[l], `/${l}${clean}`])),
      "x-default": `/en${clean}`,
    },
    languagesUrls: Object.fromEntries(locales.map((l) => [l, `${base}/${l}${clean}`])),
  };
}

/**
 * Shared social/SEO metadata (Open Graph, Twitter, robots, keywords).
 * Every page-local `generateMetadata` spreads this for consistency.
 */
export function buildMetadata({
  locale,
  path = "/",
  title,
  description,
}: {
  locale: Locale;
  path?: string;
  title?: string;
  description?: string;
}): Metadata {
  const d = getDictionary(locale);
  const t = title ?? d.meta.title;
  const desc = description ?? d.meta.description;
  const { canonical, languages } = alternatesFor(locale, path);
  const url = `${baseUrl()}/${locale}${path === "/" ? "" : path}`;
  return {
    // no "| BETX" here: the root layout's title.template appends it once
    title: t.replace(/\s*\|\s*BETX\s*$/i, ""),
    description: desc,
    keywords: d.meta.keywords,
    applicationName: "BETX",
    category: "games",
    alternates: { canonical, languages },
    openGraph: {
      type: "website",
      siteName: "BETX",
      title: t,
      description: desc,
      url,
      locale: intlTags[locale].replace("-", "_"),
      alternateLocale: locales.filter((l) => l !== locale).map((l) => intlTags[l].replace("-", "_")),
      images: [{ url: ogImage, width: 1200, height: 630, alt: "BETX — Turn your luck into dollars" }],
    },
    twitter: {
      card: "summary_large_image",
      title: t,
      description: desc,
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
    },
  };
}

/** JSON-LD: organization + website + the game itself (helps rich results). */
export function structuredData(locale: Locale) {
  const d = getDictionary(locale);
  const base = baseUrl();
  const home = `${base}/${locale}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "BETX",
      url: base,
      logo: `${base}/icons/icon-512.png`,
      description: d.meta.description,
      sameAs: config.telegram.username ? [`https://t.me/${config.telegram.username}`] : undefined,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "BETX",
      url: home,
      inLanguage: locale,
      description: d.meta.description,
      potentialAction: {
        "@type": "SearchAction",
        target: `${home}?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "BETX",
      applicationCategory: "GameApplication",
      operatingSystem: "Web, Android, iOS, Windows, macOS, Linux",
      url: home,
      description: d.meta.description,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      image: `${base}${ogImage}`,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: d.faq.items.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
}
