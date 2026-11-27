"use client";

import { useI18n } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { BALANCE_SOURCE } from "@/lib/balanceStatus";

export type BalanceBadgeKind = "onchain" | "ledger" | "demo";

const SOURCE_BY_KIND: Record<BalanceBadgeKind, string> = {
  onchain: BALANCE_SOURCE.ONCHAIN,
  ledger: BALANCE_SOURCE.LEDGER,
  demo: BALANCE_SOURCE.DEMO,
};

const ARIA_PREFIX: Record<Locale, string> = {
  en: "Balance source",
  es: "Fuente del saldo",
  fa: "منبع موجودی",
  ar: "مصدر الرصيد",
  tr: "Bakiye kaynağı",
  ru: "Источник баланса",
};

export function BalanceBadge({ kind }: { kind: BalanceBadgeKind }) {
  const { d, dir, locale } = useI18n();
  const label =
    kind === "onchain"
      ? d.ui.balanceOnchain
      : kind === "ledger"
        ? d.ui.balanceLedger
        : d.ui.balanceDemo;
  const tone =
    kind === "onchain"
      ? "border-neon/40 bg-neon/10 text-neon-2"
      : kind === "ledger"
        ? "border-foil/40 bg-foil/10 text-foil"
        : "border-white/20 bg-white/[0.06] text-mint";

  return (
    <span
      dir={dir}
      data-balance-source={SOURCE_BY_KIND[kind]}
      aria-label={`${ARIA_PREFIX[locale]}: ${label}`}
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-[0.12em] ${tone}`}
    >
      {label}
    </span>
  );
}
