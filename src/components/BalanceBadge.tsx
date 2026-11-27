"use client";

import { useI18n } from "@/i18n/client";

export type BalanceBadgeKind = "onchain" | "ledger" | "demo";

export function BalanceBadge({ kind }: { kind: BalanceBadgeKind }) {
  const { d } = useI18n();
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
      dir="ltr"
      aria-label={`BALANCE SOURCE: ${label}`}
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-[0.12em] ${tone}`}
    >
      {label}
    </span>
  );
}
