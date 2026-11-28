import { NextRequest, NextResponse } from "next/server";
import { limitByIp } from "@/lib/ratelimit";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { walletNonces } from "@/db/schema";
import { config } from "@/lib/config";
import {
  buildSolanaLoginMessage,
  isValidSolanaAddress,
} from "@/lib/solana";
import { UserError } from "@/lib/store";
import { handleError, maintenanceBlocked } from "@/lib/api";

export const dynamic = "force-dynamic";

function resolveRequestUri(req: NextRequest): string {
  const originHeader = req.headers.get("origin")?.trim();
  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {
      // اگر هدر نامعتبر بود به مرحله بعد می‌رویم
    }
  }
  if (req.nextUrl?.origin) {
    return req.nextUrl.origin;
  }
  return config.appUrl;
}

/** Step 1 of Sign-In with Solana: issue a one-time message for the wallet to sign. */
export async function POST(req: NextRequest) {
  try {
    const blocked = maintenanceBlocked();
    if (blocked) return blocked;
    await limitByIp("nonce", 20);
    const body = await req.json().catch(() => ({}));
    const rawAddress = String(body?.address ?? "").trim();

    if (!isValidSolanaAddress(rawAddress)) {
      throw new UserError("badAddress");
    }

    const nonce = randomBytes(16).toString("hex");
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 10 * 60 * 1000);
    const uri = resolveRequestUri(req);
    const message = buildSolanaLoginMessage({
      address: rawAddress,
      nonce,
      uri,
      issuedAt,
      expiresAt,
    });

    await db.insert(walletNonces).values({
      nonce,
      address: rawAddress,
      message,
      expiresAt,
    });

    return NextResponse.json({ ok: true, nonce, message });
  } catch (e) {
    return handleError(e);
  }
}