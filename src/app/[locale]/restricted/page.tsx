import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getDictionary } from "@/i18n";
import { interpolate, isLocale } from "@/i18n/config";
import { countryFrom } from "@/lib/geo";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, alternates: { canonical: "/en/restricted" } };

export default async function RestrictedPage({ params }: PageProps<"/[locale]/restricted">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);
  const country = countryFrom(await headers()) ?? "—";
  const support = process.env.SUPPORT_EMAIL;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="panel relative w-full max-w-lg overflow-hidden rounded-3xl p-8 text-center">
        <div className="guilloche pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative">
          <div dir="ltr" className="flex justify-center">
            <Logo />
          </div>
          <p className="micro mt-8 text-foil">REGION RESTRICTED · {country}</p>
          <h1 className="mt-3 text-3xl font-black text-white">{d.compliance.restrictedTitle}</h1>
          <p className="mt-4 text-[15px] leading-8 text-mint">{interpolate(d.compliance.restrictedBody, { country })}</p>
          {support ? (
            <a href={`mailto:${support}`} className="btn-neon focus-ring mt-6 inline-block rounded-xl px-6 py-3 font-bold">
              {support}
            </a>
          ) : null}
          <nav className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-mint">
            <Link href={`/${locale}/terms`} className="hover:text-white">{d.footer.terms}</Link>
            <Link href={`/${locale}/privacy`} className="hover:text-white">{d.footer.privacy}</Link>
            <Link href={`/${locale}/responsible-gaming`} className="hover:text-white">{d.footer.responsible}</Link>
          </nav>
        </div>
      </div>
    </main>
  );
}
