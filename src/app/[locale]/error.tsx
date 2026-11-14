"use client";

import { useEffect } from "react";

/** Last-resort UI: a render error never leaves the player on a blank page. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md rounded-2xl p-8 text-center">
        <p className="micro text-foil">BETX · ERROR</p>
        <h1 className="mt-3 text-2xl font-black text-white">Something went wrong · مشکلی پیش آمد</h1>
        <p className="mt-3 text-sm text-mint">Your balance is safe. Please try again. · موجودی‌ات امن است؛ دوباره تلاش کن.</p>
        <button onClick={reset} className="btn-neon focus-ring mt-6 w-full rounded-xl px-6 py-3 font-bold">
          Retry · تلاش دوباره
        </button>
        {error.digest ? <p className="mt-3 font-display text-[10px] text-mint/50">ref {error.digest}</p> : null}
      </div>
    </main>
  );
}
