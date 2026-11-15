import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { PoolBand } from "@/components/PoolBand";
import { Wheel } from "@/components/Wheel";
import { VaultCandleChart } from "@/components/VaultCandleChart";
import { Wallet } from "@/components/Wallet";
import { Faq, HowItWorks, Invite, Leaderboard, Prizes, SiteFooter, WinnersTicker } from "@/components/Sections";
import { WinnersHistory } from "@/components/WinnersHistory";
import { AppProvider } from "@/components/AppProvider";
import { Toasts } from "@/components/Toasts";
import { Compliance } from "@/components/Compliance";
import { WalletProvider } from "@/components/WalletProvider";
import { InstallBanner } from "@/components/InstallPrompt";
import { ServiceWorkerRegistration } from "@/components/ServiceWorker";
import { PerfAdaptive } from "@/components/PerfAdaptive";
import { I18nProvider } from "@/i18n/client";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";
import { getState } from "@/lib/store";
import { config } from "@/lib/config";
import { createDemoState } from "@/lib/demoSession";
import { buildMetadata, structuredData } from "@/lib/site";
import { maybeRunAutomation } from "@/lib/automation";
import { after } from "next/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDictionary(locale);
  return buildMetadata({ locale, path: "/" });
}

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  let state = null;
  if (config.live) {
    after(maybeRunAutomation);
    try {
      state = await getState();
    } catch (e) {
      console.error("state load failed", e);
    }
  } else {
    state = createDemoState();
  }

  const jsonLd = structuredData(locale);

  return (
    <I18nProvider locale={locale} dict={getDictionary(locale)}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <AppProvider initialState={state} demoEnabled={!config.live}>
        <WalletProvider demoEnabled={!config.live}>
        <main className="relative">
          <Header />
          <Hero />
          <WinnersTicker />
          <PoolBand />
          <Wheel />
          <VaultCandleChart />
          <Wallet />
          <Prizes />
          <HowItWorks />
          <Leaderboard />
          <WinnersHistory />
          <Invite />
          <Faq />
          <SiteFooter />
        </main>
        <Toasts />
        <Compliance />
        <InstallBanner />
        <ServiceWorkerRegistration />
        <PerfAdaptive />
        </WalletProvider>
      </AppProvider>
    </I18nProvider>
  );
}
