import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/LegalPage";
import { isLocale, locales } from "@/i18n/config";
import { legalDoc } from "@/i18n/legal";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: `${legalDoc("privacy").title} | BETX`,
    alternates: {
      canonical: `/${locale}/privacy`,
      languages: Object.fromEntries(locales.map((l) => [l, `/${l}/privacy`])),
    },
  };
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LegalPage locale={locale} kind="privacy" />;
}
