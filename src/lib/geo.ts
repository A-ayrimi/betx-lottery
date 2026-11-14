/**
 * Geo-compliance. Country comes from the edge (Vercel / Cloudflare headers).
 * The final blocked list MUST follow your gambling licence + sanctions law.
 */

// Starting point only: OFAC-sanctioned + commonly excluded regulated markets.
const DEFAULT_BLOCKED = ["US", "GB", "FR", "NL", "AU", "KP", "IR", "CU", "SY"];

export function blockedCountries(): string[] {
  const raw = process.env.BLOCKED_COUNTRIES;
  if (raw === undefined) return DEFAULT_BLOCKED;
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/** Enforced when GEO_BLOCK=on (opt-in so global users can access by default). */
export function geoEnforced() {
  return process.env.GEO_BLOCK === "on";
}

type HeaderBag = { get(name: string): string | null };

export function countryFrom(h: HeaderBag): string | null {
  const c =
    h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || h.get("x-country-code") || "";
  const up = c.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(up) && up !== "XX" && up !== "T1" ? up : null;
}

export function isBlockedCountry(country: string | null) {
  if (!country) return false;
  return blockedCountries().includes(country);
}

export function regionStatus(h: HeaderBag) {
  const country = countryFrom(h);
  return { country, blocked: geoEnforced() && isBlockedCountry(country) };
}
