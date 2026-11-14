import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";

/** Recursively sort object keys — NOWPayments signs the key-sorted JSON. */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortDeep((value as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return value;
}

export function verifyIpnSignature(body: unknown, signature: string | null) {
  const secret = config.nowpayments.ipnSecret.trim();
  if (!secret || !signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secret).update(JSON.stringify(sortDeep(body))).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function np<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.nowpayments.base}${path}`, {
    ...init,
    headers: {
      "x-api-key": config.nowpayments.apiKey,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`NOWPayments ${path} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json as T;
}

export interface NpInvoice {
  id: string | number;
  invoice_url: string;
  order_id: string;
}

export function createInvoice(params: { amountUsd: number; orderId: string; description: string }) {
  return np<NpInvoice>("/invoice", {
    method: "POST",
    body: JSON.stringify({
      price_amount: params.amountUsd,
      price_currency: "usd",
      pay_currency: config.nowpayments.payCurrency,
      order_id: params.orderId,
      order_description: params.description,
      ipn_callback_url: `${config.appUrl}/api/payments/ipn`,
      success_url: `${config.appUrl}/?deposit=success#wallet`,
      cancel_url: `${config.appUrl}/?deposit=cancel#wallet`,
      is_fee_paid_by_user: false,
    }),
  });
}

export interface NpPayment {
  payment_id: number | string;
  payment_status: string;
  price_amount: number;
  price_currency: string;
  pay_currency: string;
  actually_paid?: number;
  order_id: string | null;
  invoice_id?: number | string | null;
}

/** Re-read the authoritative status from NOWPayments (never trust the webhook body alone). */
export function getPayment(paymentId: string | number) {
  return np<NpPayment>(`/payment/${paymentId}`);
}
