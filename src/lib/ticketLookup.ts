import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rounds, ticketTiers, tickets } from "@/db/schema";
import { normalizeRoundStatus, ROUND_STATUSES } from "@/lib/store";
import { isTicketSerial } from "@/lib/ticketSerial";

export type TicketLookupRow = {
  serial: string;
  roundId: number;
  roundStatus: string;
  ticketStatus: "pending" | "winner" | "lost" | "refunded";
  tierCode: string;
  tierName: string;
  username: string;
  walletAddress: string | null;
  transactionSignature: string | null;
  createdAt: string;
  winningSerial: string | null;
  prize: number;
  seedHash: string | null;
};

export async function getTicketBySerial(serial: string): Promise<TicketLookupRow | null> {
  if (!isTicketSerial(serial)) return null;

  const [row] = await db
    .select({
      serial: tickets.ticketSerial,
      status: tickets.status,
      username: tickets.username,
      walletAddress: tickets.walletAddress,
      transactionSignature: tickets.transactionSignature,
      createdAt: tickets.createdAt,
      roundId: rounds.id,
      roundStatus: rounds.status,
      winningSerial: rounds.winningSerial,
      prize: rounds.prize,
      seedHash: rounds.seedHash,
      tierCode: ticketTiers.code,
      tierName: ticketTiers.name,
    })
    .from(tickets)
    .innerJoin(rounds, eq(tickets.roundId, rounds.id))
    .innerJoin(ticketTiers, eq(tickets.tierId, ticketTiers.id))
    .where(eq(tickets.ticketSerial, serial))
    .limit(1);

  if (!row) return null;

  const roundStatus = normalizeRoundStatus(row.roundStatus);
  const isWinner = Boolean(row.winningSerial && row.winningSerial === row.serial);
  const ticketStatus: TicketLookupRow["ticketStatus"] =
    row.status === "refunded" || roundStatus === ROUND_STATUSES.REFUNDED
      ? "refunded"
      : roundStatus === ROUND_STATUSES.SETTLED
        ? isWinner
          ? "winner"
          : "lost"
        : "pending";

  return {
    serial: row.serial,
    roundId: row.roundId,
    roundStatus,
    ticketStatus,
    tierCode: row.tierCode,
    tierName: row.tierName,
    username: row.username,
    walletAddress: row.walletAddress,
    transactionSignature: row.transactionSignature,
    createdAt: new Date(row.createdAt).toISOString(),
    winningSerial: row.winningSerial,
    prize: isWinner ? Number(row.prize) : 0,
    seedHash: row.seedHash,
  };
}
