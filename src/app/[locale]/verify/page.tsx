import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDrawHistory } from "@/lib/history";
import { I18nProvider } from "@/i18n/client";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";
import { buildMetadata } from "@/lib/site";
import { VerifyExplorer } from "@/components/VerifyExplorer";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/verify">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDictionary(locale);
  return buildMetadata({ locale, path: "/verify", title: d.board.historyTitle, description: d.board.historyBody });
}

export default async function VerifyIndex({ params }: PageProps<"/[locale]/verify">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  let rows: Awaited<ReturnType<typeof requireDrawHistory>> = [];
  let dataUnavailable = false;
  try {
    rows = await requireDrawHistory(30);
  } catch {
    dataUnavailable = true;
    console.error("Draw history could not be loaded.");
  }
  return (
    <I18nProvider locale={locale} dict={getDictionary(locale)}>
      <VerifyExplorer rows={rows} dataUnavailable={dataUnavailable} />
    </I18nProvider>
  );
}
