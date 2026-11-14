export function Mark({
  className = "",
  gold = false,
}: {
  className?: string;
  gold?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="BETX"
      fill="none"
    >
      <defs>
        <linearGradient id="betx-foil" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#35FFB0" />
          <stop offset="52%" stopColor="#10E28E" />
          <stop offset="100%" stopColor="#E9C46A" />
        </linearGradient>
      </defs>
      {/* perforated ticket stub, X carved out of it */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={gold ? "url(#betx-foil)" : "currentColor"}
        d="M12,4 H52 A8,8 0 0 1 60,12 V24 A8,8 0 0 0 60,40 V52 A8,8 0 0 1 52,60 H12 A8,8 0 0 1 4,52 V40 A8,8 0 0 0 4,24 V12 A8,8 0 0 1 12,4 Z
           M20,15 L29,15 L45,49 L36,49 Z
           M35,15 L44,15 L28,49 L19,49 Z"
      />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 380 120"
      className={className}
      role="img"
      aria-label="BETX"
      fill="currentColor"
    >
      {/* B */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0,10 H52 C70,10 80,21 80,33 C80,43 73,50 63,53 C76,56 86,65 86,77 C86,95 72,110 52,110 H0 Z
           M22,30 H47 C55,30 59,35 59,41 C59,47 55,52 47,52 H22 Z
           M22,68 H49 C58,68 63,73 63,79 C63,85 58,90 49,90 H22 Z"
      />
      {/* E */}
      <path d="M100,10 H170 V32 H122 V49 H162 V71 H122 V88 H172 V110 H100 Z" />
      {/* T */}
      <path d="M185,10 H265 V32 H239 V110 H211 V32 H185 Z" />
      {/* X */}
      <path d="M287,10 H316 L331,40 L346,10 H375 L346,60 L376,110 H347 L331,79 L315,110 H286 L315,60 Z" />
    </svg>
  );
}

export function Logo({
  className = "",
  gold = true,
  showWord = true,
}: {
  className?: string;
  gold?: boolean;
  showWord?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark className="h-9 w-9 shrink-0" gold={gold} />
      {showWord ? (
        <span className="flex flex-col leading-none">
          <Wordmark className="h-5 w-auto text-[#F2FBF7]" />
          <span
            dir="ltr"
            className="mt-1 font-display text-[9px] tracking-[0.42em] text-emerald-300/70"
          >
            LUCKY POOL
          </span>
        </span>
      ) : null}
    </span>
  );
}
