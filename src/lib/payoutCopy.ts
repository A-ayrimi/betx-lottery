"use client";

import type { Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { formatNumber, formatPercent, usd } from "@/lib/format";
import { useApp } from "@/components/AppProvider";

type PayoutTier = {
  priceUsd: number | string;
  capacity: number;
  prize: number | string;
  treasury: number | string;
  admin: number | string;
  prizePercentage?: number | string;
  treasuryPercentage?: number | string;
  adminPercentage?: number | string;
};

export function payoutVars(tier: PayoutTier | null | undefined, locale: Locale) {
  const price = Number(tier?.priceUsd ?? 1);
  const capacity = Number(tier?.capacity ?? 50);
  const prize = Number(tier?.prize ?? 37.5);
  const treasury = Number(tier?.treasury ?? 7.5);
  const admin = Number(tier?.admin ?? 5);
  const prizePct = Number(tier?.prizePercentage ?? 75);
  const treasuryPct = Number(tier?.treasuryPercentage ?? 15);
  const adminPct = Number(tier?.adminPercentage ?? 10);

  return {
    capacity: formatNumber(capacity, locale),
    price: usd(price, locale),
    pool: usd(price * capacity, locale),
    prize: usd(prize, locale),
    winner: usd(prize, locale),
    treasury: usd(treasury, locale),
    admin: usd(admin, locale),
    prizePct: formatPercent(prizePct / 100, locale),
    treasuryPct: formatPercent(treasuryPct / 100, locale),
    adminPct: formatPercent(adminPct / 100, locale),
  };
}

export function useSelectedPayoutVars() {
  const { state, selectedTierCode } = useApp();
  const { locale } = useI18n();
  const tier = state?.tiers.find((item) => item.code === selectedTierCode) ?? state?.tiers[0];
  return payoutVars(tier, locale);
}
