import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/LegalPage";
import { isLocale, locales } from "@/i18n/config";
import { legalDoc } from "@/i18n/legal";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: `${legalDoc("terms").title} | BETX`,
    alternates: {
      canonical: `/${locale}/terms`,
      languages: Object.fromEntries(locales.map((l) => [l, `/${l}/terms`])),
    },
  };
}

export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LegalPage locale={locale} kind="terms" />;
}
