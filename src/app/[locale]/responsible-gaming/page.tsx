import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/LegalPage";
import { isLocale, locales } from "@/i18n/config";
import { legalDoc } from "@/i18n/legal";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/responsible-gaming">): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: `${legalDoc("responsible-gaming").title} | BETX`,
    alternates: {
      canonical: `/${locale}/responsible-gaming`,
      languages: Object.fromEntries(locales.map((l) => [l, `/${l}/responsible-gaming`])),
    },
  };
}

export default async function ResponsibleGamingPage({ params }: PageProps<"/[locale]/responsible-gaming">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LegalPage locale={locale} kind="responsible-gaming" />;
}
