import { NextRequest, NextResponse } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { config } from "@/lib/config";
import { ensureSeed, makeReferralCode, rewardSignupReferral, setSession, UserError } from "@/lib/store";
import { assertRegion, handleError } from "@/lib/api";
import { getRequestLocale } from "@/i18n";

export const dynamic = "force-dynamic";

const slug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);

export async function POST(req: NextRequest) {
  try {
    if (config.tronOnly) throw new UserError("comingSoon", 503);
    await ensureSeed();
    const country = await assertRegion();
    await limitByIp("connect", 10);
    const locale = await getRequestLocale();
    const body = await req.json().catch(() => ({}));
    const username = slug(String(body.username ?? ""));
    const telegram = String(body.telegram ?? "").trim().slice(0, 32);
    const referral = String(body.referral ?? "").trim().toUpperCase();

    if (username.length < 3) throw new UserError("usernameShort");

    const existing = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
    if (existing) {
      // A username is not a credential — returning live users sign in via Telegram.
      if (config.live) throw new UserError("usernameTaken", 409);
      await setSession(existing.id);
      return NextResponse.json({ ok: true, created: false });
    }

    if (body.acceptTerms !== true) throw new UserError("mustAccept");

    const created = (
      await db
        .insert(users)
        .values({
          username,
          displayName: username,
          telegram: telegram || null,
          referralCode: makeReferralCode(username),
          locale,
          country,
          termsAcceptedAt: new Date(),
        })
        .returning()
    )[0];

    if (referral) await rewardSignupReferral(db, created.id, referral);
    await setSession(created.id);
    return NextResponse.json({ ok: true, created: true });
  } catch (e) {
    return handleError(e);
  }
}
