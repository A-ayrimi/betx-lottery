export interface NpInvoice {
  id: string | number;
  invoice_url: string;
  order_id: string;
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

export function verifyIpnSignature(_body: unknown, _signature: string | null): false {
  return false;
}

export async function createInvoice(_params: {
  amountUsd: number;
  orderId: string;
  description: string;
}): Promise<NpInvoice> {
  throw new Error("legacy_payment_provider_disabled");
}

export async function getPayment(_paymentId: string | number): Promise<NpPayment> {
  throw new Error("legacy_payment_provider_disabled");
}
