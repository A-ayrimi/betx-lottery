import type { getState } from "@/lib/store";

export type AppState = Awaited<ReturnType<typeof getState>>;
export type UserState = NonNullable<AppState["user"]>;
export type RoundState = AppState["round"];
export type TicketStub = RoundState["tickets"][number];
export type VaultState = AppState["vault"];
export type WinnerState = AppState["winners"][number];
export type LeaderRow = AppState["leaderboard"][number];

export interface DrawResult {
  winnerName: string;
  winningSerial: string;
  prize: number;
  fee: number;
  roundId: number;
  serverSeed?: string;
  drawnAt?: string;
  adminWallet?: string;
  serials?: string[];
  youWon?: boolean;
  yourTickets?: number;
  demo?: boolean;
}
