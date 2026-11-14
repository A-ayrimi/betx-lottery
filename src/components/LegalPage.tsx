import Link from "next/link";
import { Logo } from "@/components/Logo";
import { getDictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { legalDoc } from "@/i18n/legal";

export function LegalPage({ locale, kind }: { locale: Locale; kind: "terms" | "privacy" | "responsible-gaming" }) {
  const d = getDictionary(locale);
  const doc = legalDoc(kind);
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/${locale}`} className="focus-ring rounded-lg" dir="ltr">
          <Logo />
        </Link>
        <Link href={`/${locale}`} className="text-sm text-mint hover:text-white">
          {d.compliance.back}
        </Link>
      </div>

      {locale !== "en" ? (
        <p className="mt-10 rounded-xl border border-foil/30 bg-foil/[0.08] px-4 py-3 text-[13px] leading-7 text-foil">
          {d.compliance.legalNotice}
        </p>
      ) : null}

      <article dir="ltr" lang="en" className="mt-8 text-left">
        <p className="micro text-neon-2">LEGAL · UPDATED {doc.updated}</p>
        <h1 className="mt-3 text-4xl font-black text-white">{doc.title}</h1>
        <div className="mt-8 space-y-8">
          {doc.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-lg font-bold text-white">{s.h}</h2>
              {s.p.map((p, i) => (
                <p key={i} className="mt-3 text-[15px] leading-8 text-mint">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </article>

      <nav className="mt-14 flex flex-wrap gap-4 border-t border-rule pt-6 text-sm text-mint">
        <Link href={`/${locale}/terms`} className="hover:text-white">{d.footer.terms}</Link>
        <Link href={`/${locale}/privacy`} className="hover:text-white">{d.footer.privacy}</Link>
        <Link href={`/${locale}/responsible-gaming`} className="hover:text-white">{d.footer.responsible}</Link>
      </nav>
    </main>
  );
}
