"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { LOCALE_COOKIE, localeNames, locales, type Locale } from "@/i18n/config";
import { useApp } from "./AppProvider";

function switchLocale(l: Locale, persistAccount: boolean) {
  document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  // persist preference on the account too (best effort)
  if (persistAccount) {
    fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "locale", locale: l }),
    }).catch(() => {});
  }
  const { pathname, search, hash, origin } = window.location;
  const rest = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "");
  // full reload on purpose: <html lang/dir> is rendered by the root layout
  window.location.assign(new URL(`/${l}${rest}${search}${hash}`, origin).toString());
}

export function LanguageSwitcher() {
  const { locale, d } = useI18n();
  const { demoEnabled } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const go = (l: Locale) => switchLocale(l, !demoEnabled);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={d.lang.label}
        aria-expanded={open}
        className="focus-ring flex items-center gap-1.5 rounded-full border border-rule px-3 py-2 text-xs font-bold uppercase text-mint transition-colors hover:border-mint/50 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />
        </svg>
        <span dir="ltr">{locale}</span>
      </button>
      {open ? (
        <ul
          role="listbox"
          className="panel absolute end-0 top-[calc(100%+8px)] z-[60] min-w-[160px] overflow-hidden rounded-xl py-1 shadow-2xl"
        >
          {locales.map((l) => (
            <li key={l}>
              <button
                role="option"
                aria-selected={l === locale}
                onClick={() => go(l)}
                className={`flex w-full items-center justify-between gap-4 px-4 py-2.5 text-start text-sm transition-colors hover:bg-white/[0.05] ${
                  l === locale ? "text-neon-2" : "text-white"
                }`}
              >
                <span>{localeNames[l]}</span>
                <span dir="ltr" className="micro text-mint">{l}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
