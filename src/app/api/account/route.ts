import { NextRequest, NextResponse } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser, selfExclude, setDepositLimit, UserError } from "@/lib/store";
import { handleError, maintenanceBlocked, unauthorized } from "@/lib/api";
import { isLocale } from "@/i18n/config";
import { countryFrom } from "@/lib/geo";

export const dynamic = "force-dynamic";

/**
 * Account compliance actions:
 *  { action: "accept_terms" }
 *  { action: "deposit_limit", amount: number | null }
 *  { action: "self_exclude", days: 1 | 7 | 30 | 36500 }
 *  { action: "locale", locale: "en" | ... }
 */
export async function POST(req: NextRequest) {
  try {
    const blocked = maintenanceBlocked();
    if (blocked) return blocked;
    const me = await getSessionUser();
    if (!me) return unauthorized();
    await rateLimit("account", me.id, 20);
    const body = await req.json().catch(() => ({}));

    switch (body.action) {
      case "accept_terms":
        await db
          .update(users)
          .set({ termsAcceptedAt: new Date(), country: me.country ?? countryFrom(req.headers) })
          .where(eq(users.id, me.id));
        break;
      case "deposit_limit":
        await setDepositLimit(me.id, body.amount === null ? null : Number(body.amount));
        break;
      case "self_exclude":
        await selfExclude(me.id, Number(body.days));
        break;
      case "locale":
        if (!isLocale(body.locale)) throw new UserError("badLimit");
        await db.update(users).set({ locale: body.locale }).where(eq(users.id, me.id));
        break;
      default:
        throw new UserError("badLimit");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
