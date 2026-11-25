export function MaintenanceBanner({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[70] border-b border-amber-300/40 bg-gradient-to-r from-amber-500/20 via-amber-400/15 to-amber-500/20 px-4 py-2 text-center backdrop-blur-xl"
    >
      <p className="mx-auto max-w-[1100px] text-[12px] font-semibold leading-5 text-amber-100">
        BETX is in maintenance mode — deposits, withdrawals, ticket purchases and
        draws may be temporarily paused while we finalize Solana (USDC) go-live.
        Please check back shortly.
      </p>
    </div>
  );
}
