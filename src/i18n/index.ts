import { cookies, headers } from "next/headers";
import { en, type Dict } from "./dictionaries/en";
import { es } from "./dictionaries/es";
import { fa } from "./dictionaries/fa";
import { ar } from "./dictionaries/ar";
import { tr } from "./dictionaries/tr";
import { ru } from "./dictionaries/ru";
import { defaultLocale, isLocale, LOCALE_COOKIE, matchLocale, type Locale } from "./config";

const dictionaries: Record<Locale, Dict> = { en, es, fa, ar, tr, ru };

export function getDictionary(locale: Locale): Dict {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}

/** Locale for server code without a [locale] param (API routes, root layout). */
export async function getRequestLocale(): Promise<Locale> {
  const h = await headers();
  const fromProxy = h.get("x-betx-locale");
  if (isLocale(fromProxy)) return fromProxy;
  const jar = await cookies();
  const c = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  return matchLocale(h.get("accept-language"));
}

export type { Dict };
