import { getDrawHistory } from "@/lib/store";

/** Server helper for the verification index (drawn rounds, newest first). */
export async function requireDrawHistory(limit = 30) {
  const { draws } = await getDrawHistory(limit, 0);
  return draws;
}
