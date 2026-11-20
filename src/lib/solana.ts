import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import nacl from "tweetnacl";

export const DEFAULT_SOLANA_TREASURY =
  "5TekXvxKMMhhHea399Kyf28Paun9pY3QhAtUte4N8xdy";
export const DEFAULT_SOLANA_USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const DEFAULT_SOLANA_DECIMALS = 6;
export const DEFAULT_SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

export interface SolanaConfig {
  treasuryAddress: string;
  usdcMint: string;
  tokenSymbol: string;
  decimals: number;
  rpcUrl: string;
  cluster: string;
  minDepositUsd: number;
}

export interface SolanaLoginMessageParams {
  address: string;
  nonce: string;
  uri: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface BuiltSolanaUsdcTransfer {
  serializedTransactionBase64: string;
  blockhash: string;
  lastValidBlockHeight: number;
  amountRaw: string;
}

export function getSolanaConfig(): SolanaConfig {
  const decimalsRaw = Number(
    process.env.SOLANA_TOKEN_DECIMALS ?? DEFAULT_SOLANA_DECIMALS
  );
  const minDepositRaw = Number(process.env.SOLANA_MIN_DEPOSIT_USD ?? "1");

  return {
    treasuryAddress: (
      process.env.SOLANA_TREASURY_ADDRESS ||
      process.env.NEXT_PUBLIC_SOLANA_TREASURY_ADDRESS ||
      DEFAULT_SOLANA_TREASURY
    ).trim(),
    usdcMint: (
      process.env.SOLANA_USDC_MINT || DEFAULT_SOLANA_USDC_MINT
    ).trim(),
    tokenSymbol: (process.env.SOLANA_TOKEN_SYMBOL || "USDC").trim(),
    decimals:
      Number.isFinite(decimalsRaw) && decimalsRaw > 0
        ? decimalsRaw
        : DEFAULT_SOLANA_DECIMALS,
    rpcUrl: (
      process.env.SOLANA_RPC_URL || DEFAULT_SOLANA_RPC_URL
    ).trim(),
    cluster: (process.env.SOLANA_CLUSTER || "mainnet-beta").trim(),
    minDepositUsd:
      Number.isFinite(minDepositRaw) && minDepositRaw > 0 ? minDepositRaw : 1,
  };
}

export function getSolanaConnection(): Connection {
  const { rpcUrl } = getSolanaConfig();
  return new Connection(rpcUrl, "confirmed");
}

export function isValidSolanaAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  try {
    const pk = new PublicKey(address.trim());
    return pk.toBase58() === address.trim();
  } catch {
    return false;
  }
}

export function shortSolanaAddr(addr: string, chars = 4): string {
  const clean = (addr || "").trim();
  if (clean.length <= chars * 2 + 3) return clean;
  return `${clean.slice(0, chars)}...${clean.slice(-chars)}`;
}

export const shortAddr = shortSolanaAddr;

export function buildSolanaLoginMessage({
  address,
  nonce,
  uri,
  issuedAt,
  expiresAt,
}: SolanaLoginMessageParams): string {
  const cleanAddress = address.trim();
  const domain = (() => {
    try {
      return new URL(uri).host;
    } catch {
      return uri;
    }
  })();

  return [
    "BETX Wallet Verification",
    `Site: ${domain}`,
    `Wallet: ${cleanAddress}`,
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt.toISOString()}`,
    `Expires: ${expiresAt.toISOString()}`,
  ].join("\n");
}

function decodeSignature(signature: string): Uint8Array | null {
  const trimmed = (signature || "").trim();
  if (!trimmed) return null;

  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length === 64) return decoded;
  } catch {
    // تلاش برای فرمت Base64
  }

  try {
    const buf = Buffer.from(trimmed, "base64");
    if (buf.length === 64) return new Uint8Array(buf);
  } catch {
    // نامعتبر
  }

  return null;
}

export function verifySolanaMessageSignature(
  message: string,
  signature: string,
  expectedAddress: string
): boolean {
  if (!message || !expectedAddress || !isValidSolanaAddress(expectedAddress)) {
    return false;
  }

  const sigBytes = decodeSignature(signature);
  if (!sigBytes) return false;

  try {
    const pubKeyBytes = new PublicKey(expectedAddress.trim()).toBytes();
    const msgBytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);
  } catch {
    return false;
  }
}

export async function recoverSolanaSigner(
  message: string,
  signature: string,
  expectedAddress?: string
): Promise<string | null> {
  if (!expectedAddress) return null;
  const isValid = verifySolanaMessageSignature(
    message,
    signature,
    expectedAddress
  );
  return isValid ? new PublicKey(expectedAddress.trim()).toBase58() : null;
}

export async function getSolanaUsdcBalance(
  ownerAddress: string
): Promise<number> {
  if (!isValidSolanaAddress(ownerAddress)) {
    throw new Error("Invalid Solana wallet address");
  }

  const { usdcMint, decimals } = getSolanaConfig();
  const connection = getSolanaConnection();
  const ownerPk = new PublicKey(ownerAddress.trim());
  const mintPk = new PublicKey(usdcMint);

  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    ownerPk,
    { mint: mintPk },
    "confirmed"
  );

  let totalRaw = 0;
  for (const item of tokenAccounts.value) {
    const info = item.account.data.parsed?.info;
    const amountStr = info?.tokenAmount?.amount;
    if (amountStr) {
      totalRaw += Number(amountStr);
    }
  }

  return totalRaw / Math.pow(10, decimals);
}

export async function buildSolanaUsdcTransferTx(params: {
  ownerAddress: string;
  amountUsd: number;
}): Promise<BuiltSolanaUsdcTransfer> {
  if (!isValidSolanaAddress(params.ownerAddress)) {
    throw new Error("Invalid Solana sender address");
  }
  const { treasuryAddress, usdcMint, decimals } = getSolanaConfig();
  if (!isValidSolanaAddress(treasuryAddress)) {
    throw new Error("Invalid Solana treasury address");
  }

  const connection = getSolanaConnection();
  const ownerPk = new PublicKey(params.ownerAddress.trim());
  const treasuryPk = new PublicKey(treasuryAddress.trim());
  const mintPk = new PublicKey(usdcMint.trim());

  const amountRawBig = BigInt(
    Math.round(params.amountUsd * Math.pow(10, decimals))
  );
  if (amountRawBig <= BigInt(0)) {
    throw new Error("Invalid USDC deposit amount");
  }

  const sourceAta = getAssociatedTokenAddressSync(
    mintPk,
    ownerPk,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const destAta = getAssociatedTokenAddressSync(
    mintPk,
    treasuryPk,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const latest = await connection.getLatestBlockhash("confirmed");
  const lastValidBlockHeightNum = Number(latest.lastValidBlockHeight);

  const tx = new Transaction({
    feePayer: ownerPk,
    blockhash: latest.blockhash,
    lastValidBlockHeight: lastValidBlockHeightNum,
  });

  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      ownerPk,
      destAta,
      treasuryPk,
      mintPk,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );

  tx.add(
    createTransferCheckedInstruction(
      sourceAta,
      mintPk,
      destAta,
      ownerPk,
      amountRawBig,
      decimals,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const rawTx = await tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  const serialized = Buffer.from(rawTx).toString("base64");
  return {
    serializedTransactionBase64: serialized,
    blockhash: latest.blockhash,
    lastValidBlockHeight: lastValidBlockHeightNum,
    amountRaw: amountRawBig.toString(),
  };
}

export async function buildSolanaUsdcPaymentTx(params: {
  ownerAddress: string;
  destinationAddress: string;
  amountUsd: number;
}): Promise<BuiltSolanaUsdcTransfer> {
  if (
    !isValidSolanaAddress(params.ownerAddress) ||
    !isValidSolanaAddress(params.destinationAddress)
  ) {
    throw new Error("Invalid Solana address");
  }
  const { usdcMint, decimals } = getSolanaConfig();
  const connection = getSolanaConnection();
  const ownerPk = new PublicKey(params.ownerAddress);
  const destinationPk = new PublicKey(params.destinationAddress);
  const mintPk = new PublicKey(usdcMint);
  const amountRaw = BigInt(
    Math.round(params.amountUsd * Math.pow(10, decimals))
  );
  if (amountRaw <= BigInt(0)) throw new Error("Invalid USDC payout amount");

  const sourceAta = getAssociatedTokenAddressSync(
    mintPk,
    ownerPk,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const destinationAta = getAssociatedTokenAddressSync(
    mintPk,
    destinationPk,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const latest = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: ownerPk,
    blockhash: latest.blockhash,
    lastValidBlockHeight: Number(latest.lastValidBlockHeight),
  });
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      ownerPk,
      destinationAta,
      destinationPk,
      mintPk,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  tx.add(
    createTransferCheckedInstruction(
      sourceAta,
      mintPk,
      destinationAta,
      ownerPk,
      amountRaw,
      decimals,
      [],
      TOKEN_PROGRAM_ID
    )
  );
  const rawTx = await tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  return {
    serializedTransactionBase64: Buffer.from(rawTx).toString("base64"),
    blockhash: latest.blockhash,
    lastValidBlockHeight: Number(latest.lastValidBlockHeight),
    amountRaw: amountRaw.toString(),
  };
}

function parseSignedTransactionBytes(signedTx: unknown): Uint8Array | null {
  if (!signedTx) return null;
  if (signedTx instanceof Uint8Array) return signedTx;
  if (Array.isArray(signedTx) && signedTx.every((n) => typeof n === "number")) {
    return new Uint8Array(signedTx);
  }
  if (typeof signedTx === "string") {
    const clean = signedTx.trim();
    try {
      const buf = Buffer.from(clean, "base64");
      if (buf.length > 0) return new Uint8Array(buf);
    } catch {
      // نامعتبر
    }
    try {
      const decoded = bs58.decode(clean);
      if (decoded.length > 0) return decoded;
    } catch {
      // نامعتبر
    }
  }
  if (typeof signedTx === "object") {
    const obj = signedTx as {
      serializedTransaction?: unknown;
      transaction?: unknown;
      serialize?: () => Uint8Array;
    };
    if (typeof obj.serialize === "function") {
      try {
        return obj.serialize();
      } catch {
        // نامعتبر
      }
    }
    if (obj.serializedTransaction) {
      return parseSignedTransactionBytes(obj.serializedTransaction);
    }
    if (obj.transaction) {
      return parseSignedTransactionBytes(obj.transaction);
    }
  }
  return null;
}

export async function broadcastSolanaSignedTransaction(
  signedTx: unknown
): Promise<{ ok: boolean; txid?: string; error?: string }> {
  try {
    const rawBytes = parseSignedTransactionBytes(signedTx);
    if (!rawBytes || rawBytes.length === 0) {
      return { ok: false, error: "Invalid signed transaction payload" };
    }

    let hasSignature = false;
    try {
      const vTx = VersionedTransaction.deserialize(rawBytes);
      hasSignature = vTx.signatures.some(
        (s) => s && s.some((byte) => byte !== 0)
      );
    } catch {
      // برای تراکنش‌های Legacy در صورت داشتن بایت امضا، طول بافر بزرگ‌تر از ۶۵ بایت است
      hasSignature = rawBytes.length > 65;
    }

    if (!hasSignature) {
      return { ok: false, error: "Transaction is unsigned" };
    }

    const connection = getSolanaConnection();
    const txid = await connection.sendRawTransaction(rawBytes, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    return { ok: true, txid };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to broadcast Solana tx",
    };
  }
}

export function solanaExplorerTxUrl(txid: string): string {
  const { cluster } = getSolanaConfig();
  const base = `https://solscan.io/tx/${encodeURIComponent(txid)}`;
  return cluster && cluster !== "mainnet-beta"
    ? `${base}?cluster=${encodeURIComponent(cluster)}`
    : base;
}

export function solanaExplorerAddressUrl(address: string): string {
  const { cluster } = getSolanaConfig();
  const base = `https://solscan.io/account/${encodeURIComponent(address)}`;
  return cluster && cluster !== "mainnet-beta"
    ? `${base}?cluster=${encodeURIComponent(cluster)}`
    : base;
}

export async function verifySolanaUsdcDepositOnChain(params: {
  txHash: string;
  expectedFromAddress: string;
  minAmountUsd: number;
}): Promise<{
  status: "pending" | "confirmed" | "failed";
  amountUsd?: number;
  reason?: string;
}> {
  const connection = getSolanaConnection();
  const { treasuryAddress, usdcMint, decimals } = getSolanaConfig();

  const txInfo = await connection.getParsedTransaction(params.txHash, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!txInfo) {
    return { status: "pending" };
  }

  if (txInfo.meta?.err) {
    return { status: "failed", reason: "On-chain transaction failed" };
  }

  const destAta = getAssociatedTokenAddressSync(
    new PublicKey(usdcMint),
    new PublicKey(treasuryAddress),
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  ).toBase58();

  const sourceOwner = isValidSolanaAddress(params.expectedFromAddress)
    ? new PublicKey(params.expectedFromAddress)
    : null;
  const sourceAta = sourceOwner
    ? getAssociatedTokenAddressSync(
        new PublicKey(usdcMint),
        sourceOwner,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ).toBase58()
    : null;

  const preBalances = txInfo.meta?.preTokenBalances ?? [];
  const postBalances = txInfo.meta?.postTokenBalances ?? [];
  const accountKeys = txInfo.transaction.message.accountKeys.map((k) =>
    typeof k === "string" ? k : k.pubkey.toBase58()
  );

  let receivedRaw = BigInt(0);
  let sentRaw = BigInt(0);

  for (const post of postBalances) {
    if (post.mint !== usdcMint) continue;
    const accKey = accountKeys[post.accountIndex];
    const pre = preBalances.find(
      (p) => p.accountIndex === post.accountIndex && p.mint === usdcMint
    );
    const postAmount = BigInt(post.uiTokenAmount?.amount ?? "0");
    const preAmount = BigInt(pre?.uiTokenAmount?.amount ?? "0");

    if (accKey === sourceAta) {
      if (preAmount > postAmount) sentRaw += preAmount - postAmount;
      continue;
    }
    if (accKey !== destAta && post.owner !== treasuryAddress) continue;
    if (postAmount > preAmount) {
      receivedRaw += postAmount - preAmount;
    }
  }
  if (!sourceOwner || sentRaw <= BigInt(0)) {
    return {
      status: "failed",
      reason: "USDC transfer origin does not match the connected wallet",
    };
  }

  if (sentRaw < receivedRaw) {
    return {
      status: "failed",
      reason: "USDC transfer amount could not be verified",
    };
  }

  const receivedUsd = Number(receivedRaw) / Math.pow(10, decimals);
  if (receivedUsd + 1e-9 < params.minAmountUsd) {
    return {
      status: "failed",
      reason: "Transferred USDC amount is below expected deposit",
    };
  }

  return { status: "confirmed", amountUsd: receivedUsd };
}