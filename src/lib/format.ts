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

/** Base amount formatting always uses Latin digits; usd() localizes display. */
export const money = (n: number | string, _locale?: Locale) =>
  Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function usd(n: number | string, locale: Locale) {
  const amount = locale === "fa"
    ? formatNumber(n, "fa", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : money(n, locale);
  return locale === "fa" ? `${amount} دلار` : `$${amount}`;
}

export const formatCurrency = (n: number | string, locale: Locale) => usd(n, locale);

const DURATION_UNITS: Record<Locale, { day: string; hour: string; minute: string }> = {
  en: { day: "d", hour: "h", minute: "m" },
  es: { day: "d", hour: "h", minute: "min" },
  fa: { day: "روز", hour: "ساعت", minute: "دقیقه" },
  ar: { day: "يوم", hour: "ساعة", minute: "دقيقة" },
  tr: { day: "g", hour: "sa", minute: "dk" },
  ru: { day: "д", hour: "ч", minute: "мин" },
};

export function formatDurationMinutes(minutes: number | string, locale: Locale) {
  const safeLocale: Locale = isLocale(locale) ? locale : "en";
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  const units = DURATION_UNITS[safeLocale];
  if (value > 0 && value % 1440 === 0) {
    return `${formatNumber(value / 1440, safeLocale, { useGrouping: false })} ${units.day}`;
  }
  if (value > 0 && value % 60 === 0) {
    return `${formatNumber(value / 60, safeLocale, { useGrouping: false })} ${units.hour}`;
  }
  return `${formatNumber(value, safeLocale, { useGrouping: false })} ${units.minute}`;
}
