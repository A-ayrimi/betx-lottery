import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppProvider } from "@/components/AppProvider";
import { Compliance } from "@/components/Compliance";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { InstallBanner } from "@/components/InstallPrompt";
import { Leaderboard, Faq, HowItWorks, Invite, Prizes, SiteFooter, WinnersTicker } from "@/components/Sections";
import { PoolBand } from "@/components/PoolBand";
import { Toasts } from "@/components/Toasts";
import { VaultCandleChart } from "@/components/VaultCandleChart";
import { Wallet } from "@/components/Wallet";
import { WalletProvider } from "@/components/WalletProvider";
import { Wheel } from "@/components/Wheel";
import { WinnersHistory } from "@/components/WinnersHistory";
import { getDictionary } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { isLocale } from "@/i18n/config";
import { publicConfig } from "@/lib/config";
import { buildMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDictionary(locale);
  return buildMetadata({ locale, path: "/", title: d.meta.title, description: d.meta.description });
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dict = getDictionary(locale);
  const demoEnabled = !publicConfig().live;

  return (
    <I18nProvider locale={locale} dict={dict}>
      <AppProvider demoEnabled={demoEnabled}>
        <WalletProvider demoEnabled={demoEnabled}>
          {demoEnabled ? (
            <p className="sticky top-0 z-[60] bg-foil px-4 py-2 text-center font-display text-xs font-bold tracking-[0.18em] text-[#161206]">
              {dict.wc.demoBadge}
            </p>
          ) : null}
          <Header />
          <main>
            <Hero />
            <WinnersTicker />
            <PoolBand />
            <HowItWorks />
            <Prizes />
            <Wheel />
            <Leaderboard />
            <WinnersHistory />
            <VaultCandleChart />
            <Invite />
            <Wallet />
            <Faq />
          </main>
          <SiteFooter />
          <Toasts />
          <InstallBanner />
          <Compliance />
        </WalletProvider>
      </AppProvider>
    </I18nProvider>
  );
}
