import { createHmac } from "node:crypto";
import { canonicalize } from "./auditChain.ts";
import { sha256Hex } from "./adminRbac.ts";

export type VrfProviderMode = "replayable" | "external" | "fail-closed";

export interface VrfProof {
  providerId: string;
  roundId: string;
  seed: string;
  nonce: string;
  signature: string;
  publicKey: string;
  ticketSnapshotHash: string;
  algorithm?: string;
}

export interface VrfProvider {
  readonly id: string;
  readonly mode: VrfProviderMode;
  verify(proof: VrfProof): Promise<boolean>;
  randomBytes(proof: VrfProof, index: number): Promise<Uint8Array>;
}

export interface ReplayableVrfProofInput {
  roundId: number | string;
  seed: string;
  ticketSnapshotHash: string;
  nonce?: string;
}

export interface ReplayableVrfProvider extends VrfProvider {
  readonly mode: "replayable";
  issueProof(input: ReplayableVrfProofInput): Promise<VrfProof>;
  replay(proof: VrfProof): Promise<boolean>;
}

const REPLAYABLE_VRF_ALGORITHM = "HMAC-SHA256-REPLAY-v1";

export const failClosedVrfProvider: VrfProvider = {
  id: "fail-closed",
  mode: "fail-closed",
  async verify() {
    return false;
  },
  async randomBytes() {
    throw new Error("VRF provider is not configured");
  },
};

export function createVrfProvider(options: {
  id: string;
  mode?: VrfProviderMode;
  verify: (proof: VrfProof) => Promise<boolean>;
  randomBytes: (proof: VrfProof, index: number) => Promise<Uint8Array>;
}): VrfProvider {
  return { id: options.id, mode: options.mode ?? "external", verify: options.verify, randomBytes: options.randomBytes };
}

export function createReplayableVrfProvider(options: {
  id?: string;
  secret: string;
}): ReplayableVrfProvider {
  const id = options.id ?? "replayable-hmac-v1";
  const issueProof = async (input: ReplayableVrfProofInput): Promise<VrfProof> => {
    const roundId = String(input.roundId);
    const nonce = input.nonce ?? "0";
    const payload = canonicalize({
      algorithm: REPLAYABLE_VRF_ALGORITHM,
      providerId: id,
      roundId,
      seed: input.seed,
      nonce,
      ticketSnapshotHash: input.ticketSnapshotHash,
    });
    const signature = createHmac("sha256", options.secret).update(payload).digest("hex");
    return {
      providerId: id,
      roundId,
      seed: input.seed,
      nonce,
      signature,
      publicKey: `replayable:${id}`,
      ticketSnapshotHash: input.ticketSnapshotHash,
      algorithm: REPLAYABLE_VRF_ALGORITHM,
    };
  };
  const verify = async (proof: VrfProof): Promise<boolean> => {
    if (proof.providerId !== id || (proof.algorithm ?? REPLAYABLE_VRF_ALGORITHM) !== REPLAYABLE_VRF_ALGORITHM) return false;
    const expected = await issueProof({
      roundId: proof.roundId,
      seed: proof.seed,
      ticketSnapshotHash: proof.ticketSnapshotHash,
      nonce: proof.nonce,
    });
    return proof.signature === expected.signature && proof.ticketSnapshotHash === expected.ticketSnapshotHash;
  };
  return {
    id,
    mode: "replayable",
    issueProof,
    verify,
    replay: verify,
    randomBytes: async (proof, index) => {
      if (!(await verify(proof))) throw new Error("VRF proof verification failed");
      const digest = await sha256Hex(`${proof.signature}:${proof.seed}:${proof.nonce}:${index}`);
      return new Uint8Array(Buffer.from(digest, "hex"));
    },
  };
}

export function ticketSnapshotHash(tickets: readonly { id: string; userId: string; tier: number }[]): string {
  return canonicalize(tickets.map((ticket) => ({ id: ticket.id, userId: ticket.userId, tier: ticket.tier })));
}

export async function hashTicketSnapshot(tickets: readonly { id: string; userId: string; tier: number }[]): Promise<string> {
  return sha256Hex(ticketSnapshotHash(tickets));
}

export async function hashVrfProof(proof: VrfProof): Promise<string> {
  return sha256Hex(canonicalize(proof));
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = BigInt(0);
  for (const byte of bytes) value = (value << BigInt(8)) + BigInt(byte);
  return value;
}

export function randomBelow(maxExclusive: number, bytes: Uint8Array): number | null {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) return null;
  const range = BigInt(maxExclusive);
  const power = BigInt(1) << BigInt(bytes.length * 8);
  const limit = (power / range) * range;
  const value = bytesToBigInt(bytes);
  if (value >= limit) return null;
  return Number(value % range);
}

export async function drawDistinctWinners(
  provider: VrfProvider,
  proof: VrfProof,
  ticketCount: number,
  winnerCount = 3,
): Promise<number[]> {
  if (!Number.isSafeInteger(ticketCount) || ticketCount <= 0) throw new Error("Invalid ticket count");
  if (!Number.isSafeInteger(winnerCount) || winnerCount <= 0 || winnerCount > ticketCount) {
    throw new Error("Invalid winner count");
  }
  if (proof.providerId !== provider.id) throw new Error("VRF proof provider mismatch");
  const verified = await provider.verify(proof);
  if (!verified) throw new Error("VRF proof verification failed");

  const winners: number[] = [];
  const seen = new Set<number>();
  for (let attempt = 0; attempt < 4096 && winners.length < winnerCount; attempt += 1) {
    const bytes = await provider.randomBytes(proof, attempt);
    const index = randomBelow(ticketCount, bytes);
    if (index === null || seen.has(index)) continue;
    seen.add(index);
    winners.push(index);
  }
  if (winners.length !== winnerCount) throw new Error("Unable to derive distinct winners");
  return winners;
}
