import { createHmac } from "node:crypto";

export function commitRevealIndex(
  serverSeed: string,
  roundId: number,
  serials: readonly string[],
): number {
  if (serials.length === 0) throw new Error("No ticket serials available for draw");
  const digest = createHmac("sha256", serverSeed)
    .update(`${roundId}:${serials.join(",")}`)
    .digest("hex");
  return parseInt(digest.slice(0, 13), 16) % serials.length;
}
