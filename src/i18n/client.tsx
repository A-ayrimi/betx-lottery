"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Dict } from "./dictionaries/en";
import { dirOf, interpolate, intlTags, type Locale } from "./config";

interface I18nCtx {
  locale: Locale;
  dir: "rtl" | "ltr";
  d: Dict;
  t: (template: string, vars?: Record<string, string | number>) => string;
  n: (value: number) => string;
  ago: (iso: string | null) => string;
  date: (iso: string | null) => string;
  href: (path: string) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dict; children: ReactNode }) {
  const value = useMemo<I18nCtx>(() => {
    const tag = intlTags[locale];
    const nf = new Intl.NumberFormat(tag);
    const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
    const df = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" });
    return {
      locale,
      dir: dirOf(locale),
      d: dict,
      t: interpolate,
      n: (v) => nf.format(v),
      ago: (iso) => {
        if (!iso) return "";
        const sec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
        const abs = Math.abs(sec);
        // under a minute: stable localized "now" so server and browser render identical text
        if (abs < 60) return rtf.format(0, "second");
        if (abs < 3600) return rtf.format(Math.round(sec / 60), "minute");
        if (abs < 86400) return rtf.format(Math.round(sec / 3600), "hour");
        return rtf.format(Math.round(sec / 86400), "day");
      },
      date: (iso) => (iso ? df.format(new Date(iso)) : ""),
      href: (path) => `/${locale}${path.startsWith("/") ? path : `/${path}`}`,
    };
  }, [locale, dict]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n must be used inside I18nProvider");
  return c;
}
