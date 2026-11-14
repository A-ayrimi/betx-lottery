import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { ensureSeed, makeReferralCode, rewardSignupReferral } from "@/lib/store";
import { fromTelegramLang } from "@/i18n/config";

export interface TgProfile {
  id: number;
  language_code?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

/**
 * Find or create the BETX account bound to a Telegram user id.
 * `refCode` is honoured only when the account is brand new — that is what
 * stops people farming rewards by re-opening the same invite link.
 */
export async function upsertTelegramUser(profile: TgProfile, refCode?: string | null, country?: string | null) {
  await ensureSeed();
  const tgId = String(profile.id);
  const found = (await db.select().from(users).where(eq(users.telegramId, tgId)).limit(1))[0];
  if (found) return { user: found, created: false, inviter: null as User | null };

  const base = (profile.username || `tg${profile.id}`).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) || `tg${profile.id}`;
  let username = base;
  const clash = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
  if (clash) username = `${base}_${randomBytes(2).toString("hex")}`;

  const displayName =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ").slice(0, 40) || username;

  let user: User;
  try {
    user = (
    await db
      .insert(users)
      .values({
        username,
        displayName,
        telegram: profile.username ? `@${profile.username}` : null,
        telegramId: tgId,
        referralCode: makeReferralCode(username),
        locale: fromTelegramLang(profile.language_code),
        country: country ?? null,
        // Telegram users accept the Terms through the bot welcome / in-app gate
        termsAcceptedAt: null,
      })
      .returning()
    )[0];
  } catch (e) {
    const again = (await db.select().from(users).where(eq(users.telegramId, tgId)).limit(1))[0];
    if (again) return { user: again, created: false, inviter: null as User | null };
    throw e;
  }

  let inviter: User | null = null;
  if (refCode) inviter = await rewardSignupReferral(db, user.id, refCode.toUpperCase());
  return { user, created: true, inviter };
}
