"use client";

import { useState } from "react";
import { useStored, writeStored } from "@/lib/useStored";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "./AppProvider";
import { useI18n } from "@/i18n/client";
import { Logo } from "./Logo";

const AGE_KEY = "betx_age_ok";
const COOKIE_KEY = "betx_cookie_ok";

/** 18+ gate, essential-cookie notice and in-app Terms acceptance. */
export function Compliance() {
  const { state, account } = useApp();
  const { d, href } = useI18n();
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const ageOk = useStored(AGE_KEY, "1") === "1";
  const cookieOk = useStored(COOKIE_KEY, "1") === "1";
  const age: "unknown" | "ok" | "denied" = denied ? "denied" : ageOk ? "ok" : "unknown";

  const needsTerms = Boolean(state?.user && !state.user.termsAccepted) && age === "ok";

  return (
    <>
      <AnimatePresence>
        {age !== "ok" ? (
          <motion.div
            key="age"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#030806]/95 px-4 backdrop-blur-xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="panel relative w-full max-w-md overflow-hidden rounded-3xl p-8 text-center">
              <div className="guilloche pointer-events-none absolute inset-0 opacity-60" />
              <div className="relative">
                <div dir="ltr" className="flex justify-center">
                  <Logo />
                </div>
                <p dir="ltr" className="font-display mt-8 text-6xl font-bold text-foil">18+</p>
                {age === "denied" ? (
                  <p className="mt-6 text-lg font-bold text-white">{d.compliance.ageDenied}</p>
                ) : (
                  <>
                    <h2 className="mt-4 text-2xl font-black text-white">{d.compliance.ageTitle}</h2>
                    <p className="mt-3 text-sm leading-7 text-mint">{d.compliance.ageBody}</p>
                    <div className="mt-7 grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setDenied(true)}
                        className="focus-ring rounded-xl border border-rule px-4 py-3.5 text-sm text-mint hover:text-white"
                      >
                        {d.compliance.ageNo}
                      </button>
                      <button
                        onClick={() => {
                          writeStored(AGE_KEY, "1");
                        }}
                        className="btn-neon focus-ring rounded-xl px-4 py-3.5 text-sm font-bold"
                      >
                        {d.compliance.ageYes}
                      </button>
                    </div>
                  </>
                )}
                <a href={href("/responsible-gaming")} className="mt-6 inline-block text-xs text-mint/70 hover:text-white">
                  {d.footer.responsible}
                </a>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {needsTerms ? (
          <motion.div
            key="terms"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] flex items-center justify-center bg-[#04100c]/90 px-4 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
          >
            <div className="panel w-full max-w-md rounded-2xl p-7">
              <p className="micro text-foil">TERMS · 18+</p>
              <h2 className="mt-3 text-2xl font-black text-white">{d.compliance.termsTitle}</h2>
              <p className="mt-3 text-sm leading-7 text-mint">{d.compliance.termsBody}</p>
              <div className="mt-4 flex gap-4 text-sm">
                <a href={href("/terms")} target="_blank" className="text-neon-2 hover:underline">{d.footer.terms}</a>
                <a href={href("/privacy")} target="_blank" className="text-neon-2 hover:underline">{d.footer.privacy}</a>
              </div>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await account({ action: "accept_terms" });
                  setBusy(false);
                }}
                className="btn-neon focus-ring mt-6 w-full rounded-xl px-6 py-3.5 font-bold disabled:opacity-60"
              >
                {d.compliance.termsAccept}
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!cookieOk && age === "ok" ? (
        <div className="fixed inset-x-3 bottom-3 z-[85] mx-auto flex max-w-2xl flex-wrap items-center gap-3 rounded-2xl border border-rule bg-[#0b1512]/95 px-5 py-4 text-[13px] text-mint shadow-2xl backdrop-blur sm:flex-nowrap">
          <p className="flex-1 leading-6">{d.compliance.cookie}</p>
          <a href={href("/privacy")} className="text-neon-2 hover:underline">{d.compliance.cookieMore}</a>
          <button
            onClick={() => {
              writeStored(COOKIE_KEY, "1");
            }}
            className="btn-neon focus-ring rounded-lg px-4 py-2 text-sm font-bold"
          >
            {d.compliance.cookieOk}
          </button>
        </div>
      ) : null}
    </>
  );
}
