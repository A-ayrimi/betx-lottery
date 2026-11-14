import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InstallGuide } from "@/components/InstallGuide";
import { ServiceWorkerRegistration } from "@/components/ServiceWorker";
import { I18nProvider } from "@/i18n/client";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";
import { buildMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/install">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDictionary(locale);
  return { ...buildMetadata({ locale, path: "/install", title: d.pwa.installTitle, description: d.pwa.installBody }), robots: { index: true, follow: true } };
}

export default async function InstallPage({ params }: PageProps<"/[locale]/install">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <I18nProvider locale={locale} dict={getDictionary(locale)}>
      <InstallGuide />
      <ServiceWorkerRegistration />
    </I18nProvider>
  );
}
