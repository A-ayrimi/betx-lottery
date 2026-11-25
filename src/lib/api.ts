import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { UserError, type ErrorCode } from "@/lib/store";
import { getDictionary, getRequestLocale } from "@/i18n";
import { interpolate } from "@/i18n/config";
import { regionStatus } from "@/lib/geo";
import { ValidationError } from "@/lib/errors";

async function message(code: ErrorCode, vars?: Record<string, string | number>) {
  const d = getDictionary(await getRequestLocale());
  return interpolate(d.errors[code], vars);
}

/** Uniform, localized JSON error handling for route handlers. */
export async function handleError(e: unknown) {
  if (e instanceof UserError) {
    return NextResponse.json(
      { ok: false, code: e.code, error: await message(e.code, e.vars) },
      { status: e.status },
    );
  }
  if (e instanceof ValidationError) {
    return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status: e.status });
  }
  console.error(e);
  return NextResponse.json({ ok: false, code: "server", error: await message("server") }, { status: 500 });
}

export async function unauthorized(code: ErrorCode = "notLoggedIn") {
  return NextResponse.json({ ok: false, code, error: await message(code) }, { status: 401 });
}

/** Throw 451 when the request comes from a restricted jurisdiction. */
export async function assertRegion() {
  const r = regionStatus(await headers());
  if (r.blocked) throw new UserError("region", 451, { country: r.country ?? "" });
  return r.country;
}
