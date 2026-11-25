import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  automationState,
  deposits,
  jobRuns,
  ledger,
  loginTokens,
  rateLimits,
  rounds,
  tickets,
  unmatchedTransfers,
  users,
  vault,
  walletNonces,
  withdrawals,
} from "@/db/schema";
import { config } from "@/lib/config";
import { autoDrawFullRounds, refundRound, TICKET_PRICE } from "@/lib/store";
import { getSolanaConfig } from "@/lib/solana";
const solanaCfg = () => getSolanaConfig();

async function solanaRpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(solanaCfg().rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: T; error?: unknown };
    if (json.error) return null;
    return json.result ?? null;
  } catch {
    return null;
  }
}

async function getBalances(address: string): Promise<{ usdc: number; sol: number }> {
  const addr = (address || "").trim();
  if (!addr) return { usdc: 0, sol: 0 };

  const [solResp, tokResp] = await Promise.all([
    solanaRpc<{ value?: number }>("getBalance", [addr, { commitment: "confirmed" }]),
    solanaRpc<{
      value?: Array<{
        account?: {
          data?: {
            parsed?: {
              info?: { tokenAmount?: { amount?: string } };
            };
          };
        };
      }>;
    }>("getTokenAccountsByOwner", [
      addr,
      { mint: solanaCfg().usdcMint },
      { encoding: "jsonParsed", commitment: "confirmed" },
    ]),
  ]);

  const lamports = solResp && typeof solResp.value === "number" ? solResp.value : 0;
  let totalRaw = BigInt(0);
  for (const item of (tokResp && tokResp.value) || []) {
    const amtStr =
      item &&
      item.account &&
      item.account.data &&
      item.account.data.parsed &&
      item.account.data.parsed.info &&
      item.account.data.parsed.info.tokenAmount &&
      item.account.data.parsed.info.tokenAmount.amount
        ? item.account.data.parsed.info.tokenAmount.amount
        : "0";
    totalRaw += BigInt(amtStr);
  }

  return {
    usdc: Number(totalRaw) / 10 ** solanaCfg().decimals,
    sol: lamports / 1e9,
  };
}

async function listIncomingUsdc(
  address: string,
  minBlockTimeSec = 0
): Promise<Array<{ txid: string; from: string; units: bigint; blockTime: number }>> {
  const addr = (address || "").trim();
  if (!addr) return [];

  const sigs = await solanaRpc<
    Array<{
      signature?: string;
      blockTime?: number | null;
      err?: unknown;
    }>
  >("getSignaturesForAddress", [addr, { limit: 25, commitment: "confirmed" }]);

  if (!Array.isArray(sigs) || sigs.length === 0) return [];

  const out: Array<{ txid: string; from: string; units: bigint; blockTime: number }> = [];

  for (const s of sigs) {
    if (!s || !s.signature || s.err) continue;
    const bt = typeof s.blockTime === "number" ? s.blockTime : Math.floor(Date.now() / 1000);
    if (minBlockTimeSec > 0 && bt < minBlockTimeSec) continue;

    const tx = await solanaRpc<{
      meta?: {
        err?: unknown;
        preTokenBalances?: Array<{
          accountIndex: number;
          mint?: string;
          owner?: string;
          uiTokenAmount?: { amount?: string };
        }>;
        postTokenBalances?: Array<{
          accountIndex: number;
          mint?: string;
          owner?: string;
          uiTokenAmount?: { amount?: string };
        }>;
      };
      transaction?: {
        message?: {
          accountKeys?: Array<string | { pubkey?: string }>;
        };
      };
    }>("getTransaction", [
      s.signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
    ]);

    if (!tx || (tx.meta && tx.meta.err)) continue;

    const rawKeys =
      (tx.transaction &&
        tx.transaction.message &&
        tx.transaction.message.accountKeys) ||
      [];
    const keys = rawKeys.map((k) =>
      typeof k === "string" ? k : k && k.pubkey ? String(k.pubkey) : ""
    );

    const map = new Map<string, { owner: string; pre: bigint; post: bigint }>();
    for (const b of (tx.meta && tx.meta.preTokenBalances) || []) {
      if (b.mint !== solanaCfg().usdcMint) continue;
      const owner = b.owner || keys[b.accountIndex] || "";
      const key = `${b.accountIndex}:${owner}`;
      const amt = b.uiTokenAmount && b.uiTokenAmount.amount ? b.uiTokenAmount.amount : "0";
      map.set(key, { owner, pre: BigInt(amt), post: BigInt(0) });
    }
    for (const b of (tx.meta && tx.meta.postTokenBalances) || []) {
      if (b.mint !== solanaCfg().usdcMint) continue;
      const owner = b.owner || keys[b.accountIndex] || "";
      const key = `${b.accountIndex}:${owner}`;
      const cur = map.get(key) || { owner, pre: BigInt(0), post: BigInt(0) };
      const amt = b.uiTokenAmount && b.uiTokenAmount.amount ? b.uiTokenAmount.amount : "0";
      cur.post = BigInt(amt);
      map.set(key, cur);
    }

    let sender = keys[0] || "";
    let received = BigInt(0);
    for (const entry of Array.from(map.values())) {
      const delta = entry.post - entry.pre;
      if (delta < BigInt(0) && entry.owner !== addr && entry.owner) sender = entry.owner;
      if (delta > BigInt(0) && entry.owner === addr) received += delta;
    }

    if (received > BigInt(0)) {
      out.push({ txid: s.signature, from: sender, units: received, blockTime: bt });
    }
  }

  return out;
}

import { creditOnchain, settleSolanaDeposit } from "@/lib/solanaDeposits";
import { payoutConfig, processAutoPayouts } from "@/lib/payout";
import { feeConfig, feeQueue } from "@/lib/fees";
import { sendMessage } from "@/lib/telegram";
import { botStrings } from "@/i18n/bot";
import { interpolate } from "@/i18n/config";

/**
 * BETX autopilot. Runs every minute (cron) and opportunistically on traffic.
 * A lease lock guarantees a single runner across all serverless instances,
 * and every step is isolated so one failure never blocks the others.
 */

const ID = "main";
const LEASE_SECONDS = 120;
const TRAFFIC_MIN_GAP_SECONDS = 50;
type Trigger = "cron" | "traffic" | "admin";

const ago = (sec: number) => new Date(Date.now() - sec * 1000);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

async function stateRow() {
  await db.insert(automationState).values({ id: ID }).onConflictDoNothing();
  return (await db.select().from(automationState).where(eq(automationState.id, ID)).limit(1))[0];
}

async function acquire(trigger: Trigger) {
  await stateRow();
  const gap = trigger === "traffic" ? TRAFFIC_MIN_GAP_SECONDS : 0;
  const res = await db.execute(sql`
    update automation_state
       set locked_until = now() + make_interval(secs => ${LEASE_SECONDS})
     where id = ${ID}
       and (locked_until is null or locked_until < now())
       and (last_run_at is null or last_run_at < now() - make_interval(secs => ${gap}))
    returning id`);
  return res.rows.length > 0;
}

/* ------------------------------------------------------------ alerts */

const THROTTLE_MIN: Record<string, number> = { default: 60, "ledger-mismatch": 30, solvency: 15, "job-error": 30 };

export async function alert(key: string, text: string) {
  const row = await stateRow();
  const alerts = { ...(row.alerts ?? {}) };
  const last = alerts[key]?.at ? new Date(alerts[key].at).getTime() : 0;
  const throttle = (THROTTLE_MIN[key.replace(/-\d+$/, "")] ?? THROTTLE_MIN.default) * 60_000;
  if (Date.now() - last < throttle) return;
  alerts[key] = { at: new Date().toISOString(), text };
  // keep the 40 most recent alerts
  const trimmed = Object.fromEntries(
    Object.entries(alerts)
      .sort((a, b) => b[1].at.localeCompare(a[1].at))
      .slice(0, 40),
  );
  await db.update(automationState).set({ alerts: trimmed }).where(eq(automationState.id, ID));
  const chat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (chat) {
    try {
      await sendMessage(chat, `ًں¤– <b>BETX autopilot</b>\n${text}`);
    } catch {
      /* best effort */
    }
  }
}

/* ------------------------------------------------------------- steps */

async function reconcileDeposits() {
  let credited = 0, expired = 0;

  const stale = await db
    .update(deposits)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(deposits.provider, "solana"), eq(deposits.status, "waiting"), lt(deposits.createdAt, ago(5 * 60))))
    .returning({ id: deposits.id });
  expired += stale.length;

  if (solanaCfg().treasuryAddress) {
    const confirming = await db
      .select({ id: deposits.id })
      .from(deposits)
      .where(and(eq(deposits.provider, "solana"), eq(deposits.status, "confirming")))
      .limit(25);
    for (const d of confirming) {
      const r = await settleSolanaDeposit(d.id);
      if (r?.credited) credited++;
      if (r?.status === "expired") expired++;
    }
  }

  return { credited, expired };
}

/** Finds USDT that reached the deposit address and credits it automatically. */
async function scanIncoming() {
  if (!solanaCfg().treasuryAddress) return { skipped: "direct deposits disabled" };
  const st = await stateRow();
  const since = Math.max((st.scanCursor ?? Date.now() - 24 * 3600_000) - 10 * 60_000, Date.now() - 7 * 24 * 3600_000);
  const incoming = await listIncomingUsdc(solanaCfg().treasuryAddress, since);
  let credited = 0, unmatched = 0, cursor = st.scanCursor ?? 0;

  for (const t of incoming) {
    cursor = Math.max(cursor, t.blockTime);
    const known = (await db.select({ id: deposits.id }).from(deposits).where(eq(deposits.txHash, t.txid)).limit(1))[0];
    if (known) continue;
    const owner = (await db.select({ id: users.id }).from(users).where(eq(users.walletAddress, t.from)).limit(1))[0];
    if (owner) {
      if (await creditOnchain(owner.id, t.txid, t.from)) credited++;
    } else {
      const ins = await db
        .insert(unmatchedTransfers)
        .values({ txHash: t.txid, fromAddress: t.from, amount: String(Number(t.units) / 10 ** solanaCfg().decimals), blockTime: new Date(t.blockTime) })
        .onConflictDoNothing()
        .returning();
      unmatched += ins.length;
    }
  }

  // a sender may link their wallet later â€” retry the parked transfers
  const parked = await db.select().from(unmatchedTransfers).limit(50);
  for (const p of parked) {
    const owner = (await db.select({ id: users.id }).from(users).where(eq(users.walletAddress, p.fromAddress)).limit(1))[0];
    if (!owner) continue;
    if (await creditOnchain(owner.id, p.txHash, p.fromAddress)) credited++;
    await db.delete(unmatchedTransfers).where(eq(unmatchedTransfers.txHash, p.txHash));
  }

  await db.update(automationState).set({ scanCursor: cursor || Date.now() }).where(eq(automationState.id, ID));
  if (unmatched > 0) await alert("unmatched", `ًں“¥ ${unmatched} USDT transfer(s) arrived from wallets not linked to any account. See /admin.`);
  return { seen: incoming.length, credited, unmatched };
}

/**
 * Safety net for the auto-draw: instantly draws EVERY open round that has
 * reached capacity. The buy flow already draws synchronously; this catches
 * anything missed (crash between sale and draw, manual DB edits, races).
 */
async function drawFullRounds() {
  const outcomes = await autoDrawFullRounds();
  for (const o of outcomes) {
    await alert(
      `draw-${o.roundId}`,
      `ًںژ° Round ${o.roundId} draw is awaiting administrator approval. Proposed winner: <b>${o.winnerName}</b> (${o.winningSerial}). No prize has been settled.`,
    );
  }
  return { drawn: outcomes.length, rounds: outcomes.map((o) => o.roundId) };
}

/** Fee transfers remain paused until historical accounting is reconciled. */
async function settleFees() {
  return { enabled: false, skipped: "financial reconciliation required" as const };
}

/** Rounds that don't fill within ROUND_TIMEOUT_HOURS are closed and refunded. */
async function refundStaleRounds() {
  const hours = Number(process.env.ROUND_TIMEOUT_HOURS ?? 24);
  if (!(hours > 0)) return { skipped: "disabled" };
  const open = await db.select().from(rounds).where(inArray(rounds.status, ["open", "OPEN"]));
  let refunded = 0, refundedTickets = 0;
  for (const r of open) {
    if (r.sold === 0) continue;
    const [first] = await db.select({ t: sql<string>`min(${tickets.createdAt})` }).from(tickets).where(eq(tickets.roundId, r.id));
    if (!first?.t || new Date(first.t).getTime() > Date.now() - hours * 3600_000) continue;
    const res = await refundRound(r.id);
    if (!res) continue;
    refunded++;
    refundedTickets += res.tickets;
    for (const u of res.users) {
      const row = (await db.select().from(users).where(eq(users.id, u.id)).limit(1))[0];
      if (!row?.telegramId) continue;
      try {
        await sendMessage(
          row.telegramId,
          interpolate(botStrings(row.locale).roundRefund, { round: r.id, hours, n: u.count, amount: `$${(u.count * TICKET_PRICE).toFixed(2)}` }),
        );
      } catch {
        /* best effort */
      }
    }
  }
  return { refunded, tickets: refundedTickets };
}

async function cleanup() {
  const n = await db.delete(walletNonces).where(lt(walletNonces.expiresAt, ago(86400))).returning({ k: walletNonces.nonce });
  const l = await db.delete(loginTokens).where(lt(loginTokens.expiresAt, ago(86400))).returning({ k: loginTokens.token });
  const r = await db.delete(rateLimits).where(lt(rateLimits.windowStart, ago(3600))).returning({ k: rateLimits.key });
  const j = await db.delete(jobRuns).where(lt(jobRuns.createdAt, ago(7 * 86400))).returning({ id: jobRuns.id });
  return { nonces: n.length, loginTokens: l.length, rateLimits: r.length, jobRuns: j.length };
}

/** Accounting invariants + solvency. Alerts the operator on any drift. */
export async function healthChecks(sendAlerts = true) {
  const mism = await db.execute(sql`
    select u.id, u.username, u.balance::float8 as balance, coalesce(sum(l.amount), 0)::float8 as ledger
      from users u left join ledger l on l.user_id = u.id
     group by u.id
    having abs(u.balance - coalesce(sum(l.amount), 0)) > 0.009
     limit 20`);
  const v = (await db.select().from(vault).limit(1))[0];
  const [vaultLedger] = await db
    .select({
      balance: sql<string>`coalesce(sum(case when ${ledger.account} = 'vault_balance' and ${ledger.reference} is not null and ${ledger.transactionKey} is not null then ${ledger.amount} else 0 end), 0)`,
    })
    .from(ledger);
  const vaultDrift = v ? Math.round((Number(v.balance) - Number(vaultLedger.balance)) * 100) / 100 : 0;

  const [bal] = await db.select({ s: sql<string>`coalesce(sum(${users.balance}), 0)` }).from(users);
  const [pend] = await db
    .select({ s: sql<string>`coalesce(sum(${withdrawals.amount}), 0)`, c: sql<number>`count(*)::int` })
    .from(withdrawals)
    .where(inArray(withdrawals.status, ["pending", "processing"]));
  const liabilities = Math.round((Number(bal.s) + Number(pend.s)) * 100) / 100;

  let holdings: number | null = null;
  const cfg = payoutConfig();
  if (solanaCfg().treasuryAddress) {
    const dep = await getBalances(solanaCfg().treasuryAddress);
    const hot = cfg.hotWallet ? await getBalances(cfg.hotWallet) : { usdc: 0, sol: 0 };
    if (dep && hot) holdings = Math.round((dep.usdc + hot.usdc) * 100) / 100;
  }
  const [reviewQ] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(withdrawals)
    .where(and(eq(withdrawals.status, "pending"), isNotNull(withdrawals.reviewReason)));

  if (sendAlerts) {
    if (mism.rows.length) await alert("ledger-mismatch", `ًںڑ¨ ${mism.rows.length} account(s) whose balance differs from the ledger. Payouts for them are held.`);
    if (Math.abs(vaultDrift) > 0.01) await alert("vault-drift", `âڑ ï¸ڈ Vault drift of $${vaultDrift.toFixed(2)} vs. ledger.`);
    if (holdings !== null && holdings + 0.01 < liabilities) {
      await alert("solvency", `ًںڑ¨ On-chain holdings $${holdings.toFixed(2)} are below player liabilities $${liabilities.toFixed(2)}.`);
    }
  }
  return {
    ledgerMismatches: mism.rows.length,
    vaultDrift,
    liabilities,
    holdings,
    solvent: holdings === null ? null : holdings + 0.01 >= liabilities,
    pendingWithdrawals: pend.c,
    reviewQueue: reviewQ?.c ?? 0,
  };
}

async function dailyReport() {
  const chat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chat) return { skipped: "no admin chat" };
  const st = await stateRow();
  if (st.lastDailyReportAt && Date.now() - new Date(st.lastDailyReportAt).getTime() < 24 * 3600_000) return { skipped: "not due" };
  const since = ago(86400);
  const [u] = await db.select({ c: sql<number>`count(*)::int` }).from(users).where(gte(users.createdAt, since));
  const [dp] = await db
    .select({ s: sql<string>`coalesce(sum(${deposits.amountUsd}), 0)`, c: sql<number>`count(*)::int` })
    .from(deposits)
    .where(and(eq(deposits.credited, true), gte(deposits.updatedAt, since)));
  const [wd] = await db
    .select({ s: sql<string>`coalesce(sum(${withdrawals.amount}), 0)`, c: sql<number>`count(*)::int` })
    .from(withdrawals)
    .where(and(eq(withdrawals.status, "paid"), gte(withdrawals.processedAt, since)));
  const [rd] = await db.select({ c: sql<number>`count(*)::int` }).from(rounds).where(and(inArray(rounds.status, ["drawn", "AWAITING_ADMIN_APPROVAL", "APPROVED", "SETTLED"]), gte(rounds.drawnAt, since)));
  const [tk] = await db.select({ c: sql<number>`count(*)::int` }).from(tickets).where(gte(tickets.createdAt, since));
  const [treasury] = await db
    .select({ amount: sql<string>`coalesce(sum(${ledger.amount}), 0)` })
    .from(ledger)
    .where(and(
      eq(ledger.account, "accounting"),
      eq(ledger.type, "treasury_contribution"),
      isNotNull(ledger.reference),
      isNotNull(ledger.transactionKey),
      gte(ledger.createdAt, since),
    ));
  const [vaultLedger] = await db
    .select({ balance: sql<string>`coalesce(sum(${ledger.amount}), 0)` })
    .from(ledger)
    .where(and(
      eq(ledger.account, "vault_balance"),
      isNotNull(ledger.reference),
      isNotNull(ledger.transactionKey),
    ));
  const h = await healthChecks(false);
  await sendMessage(
    chat,
    [
      "ًں“ٹ <b>BETX â€” last 24h</b>",
      `New players: <b>${u.c}</b>`,
      `Deposits: <b>$${Number(dp.s).toFixed(2)}</b> (${dp.c})`,
      `Withdrawals paid: <b>$${Number(wd.s).toFixed(2)}</b> (${wd.c})`,
      `Tickets: <b>${tk.c}</b> آ· Rounds drawn: <b>${rd.c}</b> آ· Treasury contributions: <b>$${Number(treasury.amount).toFixed(2)}</b>`,
      `Vault (verified ledger): <b>$${Number(vaultLedger.balance).toFixed(2)}</b>`,
      `Liabilities: $${h.liabilities.toFixed(2)}${h.holdings !== null ? ` آ· On-chain: $${h.holdings.toFixed(2)} ${h.solvent ? "âœ…" : "ًںڑ¨"}` : ""}`,
      `Review queue: ${h.reviewQueue} آ· Ledger check: ${h.ledgerMismatches === 0 ? "âœ…" : "ًںڑ¨ " + h.ledgerMismatches}`,
    ].join("\n"),
  );
  await db.update(automationState).set({ lastDailyReportAt: new Date() }).where(eq(automationState.id, ID));
  return { sent: true };
}

/* -------------------------------------------------------------- runner */

export async function runAutomation(trigger: Trigger) {
  if (!(await acquire(trigger))) return { skipped: true as const };
  const started = Date.now();
  const report: Record<string, unknown> = {};
  const errors: string[] = [];
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      report[name] = await fn();
    } catch (e) {
      errors.push(`${name}: ${msg(e)}`);
      report[name] = { error: msg(e) };
    }
  };

  await step("deposits", reconcileDeposits);
  await step("scan", scanIncoming);
  await step("draws", drawFullRounds);
  await step("fees", settleFees);
  await step("rounds", refundStaleRounds);
  await step("payouts", () => processAutoPayouts(alert));
  await step("cleanup", cleanup);
  await step("health", () => healthChecks(true));
  await step("daily", dailyReport);

  const ok = errors.length === 0;
  const error = ok ? null : errors.join(" | ").slice(0, 2000);
  const durationMs = Date.now() - started;
  await db
    .update(automationState)
    .set({ lockedUntil: null, lastRunAt: new Date(), lastReport: report, lastError: error })
    .where(eq(automationState.id, ID));
  await db.insert(jobRuns).values({ trigger, ok, durationMs, report, error });
  if (!ok) await alert("job-error", `âڑ ï¸ڈ Some automation steps failed:\n${errors.join("\n")}`);
  return { skipped: false as const, ok, durationMs, report, errors };
}

/** Fire-and-forget heartbeat used by page/API traffic (cheap when not due). */
export async function maybeRunAutomation() {
  try {
    await runAutomation("traffic");
  } catch (e) {
    console.error("automation (traffic) failed", e);
  }
}

export async function automationStatus() {
  const st = await stateRow();
  const runs = await db.select().from(jobRuns).orderBy(desc(jobRuns.id)).limit(15);
  const unmatched = await db.select().from(unmatchedTransfers).orderBy(desc(unmatchedTransfers.blockTime)).limit(20);
  const cfg = payoutConfig();
  const fq = await feeQueue();
  const fc = feeConfig();
  return {
    lastRunAt: st.lastRunAt,
    ageSeconds: st.lastRunAt ? Math.round((Date.now() - new Date(st.lastRunAt).getTime()) / 1000) : null,
    lastReport: st.lastReport,
    lastError: st.lastError,
    alerts: Object.entries(st.alerts ?? {})
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.at.localeCompare(a.at)),
    runs,
    unmatched,
    payout: {
      enabled: cfg.enabled,
      keyConfigured: cfg.keyConfigured,
      keyValid: cfg.keyValid,
      hotWallet: cfg.hotWallet,
      maxPerTx: cfg.maxPerTx,
      dailyMax: cfg.dailyMax,
    },
    roundTimeoutHours: Number(process.env.ROUND_TIMEOUT_HOURS ?? 24),
    solana: { enabled: solanaCfg().treasuryAddress, network: solanaCfg().cluster, depositAddress: solanaCfg().treasuryAddress || null },
    fees: {
      autoSweep: fc.enabled,
      adminWallet: fc.adminWallet,
      pending: fq.pending,
      paid: fq.paid,
      queue: fq.rows.map((r) => ({
        id: r.id,
        roundId: r.roundId,
        amount: Number(r.amount),
        status: r.status,
        txHash: r.txHash,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      })),
    },
  };
}

