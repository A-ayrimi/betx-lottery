"use client";

import { useEffect } from "react";

/**
 * Registers the build-versioned service worker (public/sw.js) so BETX is
 * installable and the shell opens offline. API calls are never cached.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
    const id = window.setTimeout(() => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => {
        console.warn("service worker registration failed", e);
      });
    }, 1200);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
