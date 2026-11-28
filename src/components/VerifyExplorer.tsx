"use client";

import Link from "next/link";
import { Logo } from "./Logo";
import { formatNumber, usd } from "@/lib/format";
import { payoutVars } from "@/lib/payoutCopy";
import { useI18n } from "@/i18n/client";

export interface VerifyRow {
  roundId: number;
  winnerName: string;
  winningSerial: string;
  winnerId?: number | null;
  prize: number;
  fee: number;
  capacity: number;
  sold: number;
  drawnAt: string | null;
  openedAt: string | null;
  seedHash: string | null;
  serverSeed: string | null;
  feeStatus: string;
  feeTxHash: string | null;
}

/** Public, crawlable proof-of-fairness index: every draw links to its verifier. */
export function VerifyExplorer({ rows, dataUnavailable = false }: { rows: VerifyRow[]; dataUnavailable?: boolean }) {
  const { d, t, locale, date } = useI18n();
  const payout = payoutVars(null, locale);
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-12 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/${locale}`} className="focus-ring rounded-lg" dir="ltr" aria-label="BETX">
          <Logo />
        </Link>
        <Link href={`/${locale}`} className="text-sm text-mint hover:text-white">
          {d.pwa.installBack}
        </Link>
      </div>

      <p className="micro mt-10 text-neon-2">{d.ui.fairHashTitle}</p>
      <h1 className="mt-3 text-[clamp(1.9rem,5vw,3rem)] font-black leading-tight text-white">{d.board.historyTitle}</h1>
      <p className="mt-4 max-w-[64ch] text-[15px] leading-8 text-mint">{d.board.historyBody}</p>

      <div className="panel mt-8 overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-start">
            <thead>
              <tr className="border-b border-rule">
                {[d.board.historyHeaders[0], d.board.historyHeaders[1], d.board.historyHeaders[2], d.board.historyHeaders[3], d.board.historyHeaders[4], ""].map(
                  (h, i) => (
                    <th key={i} scope="col" className="px-5 py-3 text-start">
                      <span className="micro text-mint">{h}</span>
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} role={dataUnavailable ? "alert" : "status"} className="px-5 py-10 text-center text-sm text-mint">
                    {dataUnavailable ? d.errors.unavailable : t(d.board.noDraws, payout)}
                  </td>
                </tr>
              ) : (
                rows.map((w) => (
                  <tr key={w.roundId} className="border-b border-rule/50 last:border-b-0 hover:bg-white/[0.03]">
                    <td className="px-5 py-4 font-display text-sm font-bold text-foil" dir="ltr">
                      #{formatNumber(w.roundId, locale)}
                    </td>
                    <td className="px-5 py-4 text-[14px] font-bold text-white">{w.winnerName}</td>
                    <td className="px-5 py-4 font-display text-[12px] tracking-[0.1em] text-neon-2" dir="ltr">
                      {w.winningSerial}
                    </td>
                    <td className="px-5 py-4 font-display text-[14px] font-bold text-foil" dir="ltr">
                      +{usd(w.prize, locale)}
                    </td>
                    <td className="px-5 py-4 text-[12px] text-mint">
                      <time dateTime={w.drawnAt ?? undefined}>{date(w.drawnAt)}</time>
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/${locale}/verify/${w.roundId}`}
                        className="text-[12px] font-bold text-neon-2 underline-offset-4 hover:underline"
                      >
                        {d.board.verify}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-[12px] leading-6 text-mint/70">
        {t(d.board.autoDrawNote, payout)} {t(d.board.treasuryNote, payout)}
      </p>
    </main>
  );
}
