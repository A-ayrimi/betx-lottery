export const locales = ["en", "es", "fa", "ar", "tr", "ru"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const rtlLocales: Locale[] = ["fa", "ar"];

export const localeNames: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fa: "فارسی",
  ar: "العربية",
  tr: "Türkçe",
  ru: "Русский",
};

/** BCP-47 tags used for Intl number/date formatting */
export const intlTags: Record<Locale, string> = {
  en: "en-US",
  es: "es-ES",
  fa: "fa-IR",
  ar: "ar",
  tr: "tr-TR",
  ru: "ru-RU",
};

export const isLocale = (v: unknown): v is Locale =>
  typeof v === "string" && (locales as readonly string[]).includes(v);

export const dirOf = (l: Locale) => (rtlLocales.includes(l) ? "rtl" : "ltr");

/** Pick the best supported locale from an Accept-Language header. */
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}

/** Map Telegram's language_code to a supported locale */
export const fromTelegramLang = (code?: string | null): Locale => {
  const base = (code || "").toLowerCase().split("-")[0];
  return isLocale(base) ? base : defaultLocale;
};

export function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
