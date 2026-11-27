export function MaintenanceBanner({ enabled, message }: { enabled: boolean; message: string }) {
  if (!enabled) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-300/40 bg-gradient-to-r from-amber-500/20 via-amber-400/15 to-amber-500/20 px-4 py-2 text-center backdrop-blur-xl"
    >
      <p className="mx-auto max-w-[1100px] text-[11px] font-semibold leading-5 text-amber-100 sm:text-[12px]">{message}</p>
    </div>
  );
}
