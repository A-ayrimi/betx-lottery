import { NextRequest, NextResponse } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { and, eq, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { users, walletNonces } from "@/db/schema";
import { recoverSigner, shortAddr } from "@/lib/tron";
import {
  ensureSeed,
  getSessionUser,
  makeReferralCode,
  rewardSignupReferral,
  setSession,
  UserError,
} from "@/lib/store";
import { assertRegion, handleError } from "@/lib/api";
import { getRequestLocale } from "@/i18n";

export const dynamic = "force-dynamic";

/**
 * Step 2 of Sign-In with TRON: verify the signature, then
 *  - signed in already  -> link the wallet to the current account
 *  - wallet known       -> sign in to that account
 *  - new wallet         -> create an account (18+/Terms required)
 */
export async function POST(req: NextRequest) {
  try {
    await ensureSeed();
    await limitByIp("verify", 20);
    const country = await assertRegion();
    const body = await req.json().catch(() => ({}));
    const nonce = String(body.nonce ?? "");
    const signature = String(body.signature ?? "");

    // burn the nonce atomically — a signature can be used exactly once
    const claimed = await db
      .update(walletNonces)
      .set({ used: true })
      .where(and(eq(walletNonces.nonce, nonce), eq(walletNonces.used, false), gt(walletNonces.expiresAt, new Date())))
      .returning();
    const challenge = claimed[0];
    if (!challenge) throw new UserError("nonceExpired", 401);

    const signer = await recoverSigner(challenge.message, signature);
    if (!signer || signer !== challenge.address) throw new UserError("badWalletSignature", 401);
    const address = signer;

    const me = await getSessionUser();
    const owner = (await db.select().from(users).where(eq(users.walletAddress, address)).limit(1))[0];

    if (me) {
      if (owner && owner.id !== me.id) throw new UserError("walletTaken", 409);
      await db
        .update(users)
        .set({ walletAddress: address, payoutAddress: me.payoutAddress ?? address })
        .where(eq(users.id, me.id));
      return NextResponse.json({ ok: true, linked: true });
    }

    if (owner) {
      await setSession(owner.id);
      return NextResponse.json({ ok: true, created: false });
    }

    if (body.acceptTerms !== true) throw new UserError("mustAccept");

    let username = `w_${address.slice(1, 9).toLowerCase()}`;
    const clash = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
    if (clash) username = `${username}_${randomBytes(2).toString("hex")}`;

    let created;
    try {
      created = (
      await db
        .insert(users)
        .values({
          username,
          displayName: shortAddr(address),
          walletAddress: address,
          payoutAddress: address,
          referralCode: makeReferralCode(username),
          locale: await getRequestLocale(),
          country,
          termsAcceptedAt: new Date(),
        })
        .returning()
      )[0];
    } catch (e) {
      const again = (await db.select().from(users).where(eq(users.walletAddress, address)).limit(1))[0];
      if (!again) throw e;
      await setSession(again.id);
      return NextResponse.json({ ok: true, created: false });
    }

    const referral = String(body.referral ?? "").trim().toUpperCase();
    if (referral) await rewardSignupReferral(db, created.id, referral);
    await setSession(created.id);
    return NextResponse.json({ ok: true, created: true });
  } catch (e) {
    return handleError(e);
  }
}
