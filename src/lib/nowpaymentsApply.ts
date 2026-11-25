import type { deposits } from "@/db/schema";
import type { NpPayment } from "@/lib/nowpayments";

type Deposit = typeof deposits.$inferSelect;

export async function applyNowPayment(
  _dep: Deposit,
  _payment: NpPayment,
): Promise<"review"> {
  return "review";
}
