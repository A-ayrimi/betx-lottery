"use client";

import { useSyncExternalStore } from "react";

/**
 * Hydration-safe access to localStorage / sessionStorage.
 * Server render uses `serverValue`; the client re-renders with the real value.
 */
const EVT = "betx-storage";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVT, cb);
  };
}

const store = (kind: "local" | "session") => (kind === "local" ? window.localStorage : window.sessionStorage);
const noopSubscribe = () => () => {};

export function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function useStored(key: string, serverValue: string | null, kind: "local" | "session" = "local") {
  return useSyncExternalStore(
    subscribe,
    () => store(kind).getItem(key),
    () => serverValue,
  );
}

export function writeStored(key: string, value: string | null, kind: "local" | "session" = "local") {
  if (value === null) store(kind).removeItem(key);
  else store(kind).setItem(key, value);
  window.dispatchEvent(new Event(EVT));
}
