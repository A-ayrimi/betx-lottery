import { NextResponse, type NextRequest } from "next/server";
import { isLocale, LOCALE_COOKIE, matchLocale } from "@/i18n/config";
import { regionStatus } from "@/lib/geo";

/** Pages that stay reachable from restricted regions (legal duty to inform). */
const OPEN_WHEN_BLOCKED = new Set(["terms", "privacy", "responsible-gaming", "restricted"]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const [, first = "", second = ""] = pathname.split("/");
  const hasLocalePrefix = isLocale(first);

  const saved = req.cookies.get(LOCALE_COOKIE)?.value;
  const locale = hasLocalePrefix
    ? first
    : isLocale(saved)
      ? saved
      : matchLocale(req.headers.get("accept-language"));
  const subpage = hasLocalePrefix ? second : first;

  // Tell the root layout which locale/dir to render
  const forward = new Headers(req.headers);
  forward.set("x-betx-locale", locale);

  // Geo-compliance + internal locale rewrite (renders `/` directly as 200 OK
  // instead of a 307 redirect that can break behind preview proxies/iframes)
  const region = regionStatus(req.headers);
  let res: NextResponse;
  if (region.blocked && !OPEN_WHEN_BLOCKED.has(subpage)) {
    const url = req.nextUrl.clone();
    url.pathname = `/${locale}/restricted`;
    res = NextResponse.rewrite(url, { request: { headers: forward } });
  } else if (!hasLocalePrefix) {
    const url = req.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    res = NextResponse.rewrite(url, { request: { headers: forward } });
  } else {
    res = NextResponse.next({ request: { headers: forward } });
  }

  if (req.cookies.get(LOCALE_COOKIE)?.value !== locale) {
    res.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return res;
}

export const config = {
  matcher: ["/((?!api|_next|admin|images|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"],
};
