import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppProvider } from "@/components/AppProvider";
import { Compliance } from "@/components/Compliance";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { InstallBanner } from "@/components/InstallPrompt";
import { Leaderboard, Faq, HowItWorks, Invite, Prizes, SiteFooter, WinnersTicker } from "@/components/Sections";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
import { PoolBand } from "@/components/PoolBand";
import { TierCards } from "@/components/TierCards";
import { Toasts } from "@/components/Toasts";
import { TransparencyPanel } from "@/components/TransparencyPanel";
import { VaultCandleChart } from "@/components/VaultCandleChart";
import { Wallet } from "@/components/Wallet";
import { WalletProvider } from "@/components/WalletProvider";
import { WeeklyJackpotWidget } from "@/components/WeeklyJackpotWidget";
import { Wheel } from "@/components/Wheel";
import { WinnersHistory } from "@/components/WinnersHistory";
import { getDictionary } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { isLocale } from "@/i18n/config";
import { publicConfig } from "@/lib/config";
import { formatNumber, money } from "@/lib/format";
import { previewState } from "@/lib/previewFallback";
import { buildMetadata } from "@/lib/site";

const SERVER_RENDERED_AT = Date.now();

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDictionary(locale);
  const tier = previewState().tiers[0];
  const description = d.meta.description
    .split("{price}")
    .join(money(tier?.priceUsd ?? publicConfig().ticketPrice))
    .split("{capacity}")
    .join(formatNumber(tier?.capacity ?? publicConfig().roundCapacity, locale));
  return buildMetadata({ locale, path: "/", title: d.meta.title, description });
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dict = getDictionary(locale);
  const demoMode = !publicConfig().live;
  const maintenance = publicConfig().maintenance;
  const databaseTestMode =
    demoMode && process.env.NODE_ENV === "development" && process.env.BETX_TEST_DATABASE_UI === "true";
  const demoEnabled = demoMode && !databaseTestMode;
  const initialState = demoEnabled ? previewState(SERVER_RENDERED_AT) : null;

  return (
    <I18nProvider locale={locale} dict={dict}>
      <AppProvider initialState={initialState} demoEnabled={demoEnabled} previewFallbackEnabled={demoMode}>
        <WalletProvider demoEnabled={demoEnabled}>
          <div className="sticky top-0 z-50">
            {demoMode ? (
              <p className="border-b border-foil/30 bg-foil px-4 py-1.5 text-center font-display text-[11px] font-bold tracking-[0.14em] text-[#161206]">
                {dict.wc.demoBadge}
              </p>
            ) : null}
            <MaintenanceBanner enabled={maintenance} message={dict.ui.maintenanceBanner} />
            <Header />
          </div>
          <main>
            <Hero />
            <WinnersTicker />
            <PoolBand />
            <TierCards />
            <HowItWorks />
            <Prizes />
            <TransparencyPanel />
            <WeeklyJackpotWidget />
            <Wheel />
            <Leaderboard />
            <WinnersHistory />
            <VaultCandleChart />
            <Invite />
            <Wallet />
            <Faq />
          </main>
          <SiteFooter year={new Date(SERVER_RENDERED_AT).getUTCFullYear()} />
          <Toasts />
          <InstallBanner />
          <Compliance />
        </WalletProvider>
      </AppProvider>
    </I18nProvider>
  );
}
