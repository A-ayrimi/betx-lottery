import { NextRequest, NextResponse } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { walletNonces } from "@/db/schema";
import { config } from "@/lib/config";
import { buildLoginMessage, isTronAddress } from "@/lib/tron";
import { UserError } from "@/lib/store";
import { handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Step 1 of Sign-In with TRON: issue a one-time message for the wallet to sign. */
export async function POST(req: NextRequest) {
  try {
    await limitByIp("nonce", 20);
    const { address } = await req.json().catch(() => ({ address: "" }));
    if (!isTronAddress(address)) throw new UserError("badAddress");

    const nonce = randomBytes(16).toString("hex");
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 10 * 60 * 1000);
    const message = buildLoginMessage({ address, nonce, uri: config.appUrl, issuedAt, expiresAt });

    await db.insert(walletNonces).values({ nonce, address, message, expiresAt });
    return NextResponse.json({ ok: true, nonce, message });
  } catch (e) {
    return handleError(e);
  }
}
