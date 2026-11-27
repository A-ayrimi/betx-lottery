import { intlTags, isLocale, type Locale } from "@/i18n/config";

const LOCALIZED_DIGITS: Partial<Record<Locale, string[]>> = {
  fa: ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"],
  ar: ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"],
};

function localize(value: string, locale: Locale) {
  const digits = LOCALIZED_DIGITS[locale];
  if (!digits) return value;
  const localized = value.replace(/[0-9]/g, (digit) => digits[Number(digit)]);
  if (locale === "fa") return localized.replace(/,/g, "٬").replace(/\./g, "٫").replace(/%/g, "٪");
  if (locale === "ar") return localized.replace(/,/g, "٬").replace(/\./g, "٫").replace(/%/g, "٪");
  return localized;
}

export function formatNumber(
  value: number | string,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
) {
  const safeLocale: Locale = isLocale(locale) ? locale : "en";
  const resolved: Intl.NumberFormatOptions = options ?? {};
  const formatted =
    safeLocale === "fa" || safeLocale === "ar"
      ? new Intl.NumberFormat("en-US", resolved).format(Number(value))
      : new Intl.NumberFormat(intlTags[safeLocale], resolved).format(Number(value));
  return localize(formatted, safeLocale);
}

export const formatPadded = (value: number, locale: Locale, width = 2) =>
  formatNumber(value, locale, { useGrouping: false, minimumIntegerDigits: width });

export const formatPercent = (ratio: number, locale: Locale, options?: Intl.NumberFormatOptions) =>
  formatNumber(ratio, locale, { style: "percent", maximumFractionDigits: 0, ...options });

/** USD amounts keep the $ prefix; digits are localized when a locale is supplied. */
export const money = (n: number | string, locale?: Locale) =>
  locale
    ? formatNumber(n, locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : Number(n).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

export const formatCurrency = (n: number | string, locale: Locale) => `$${money(n, locale)}`;
