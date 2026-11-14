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
import { autoDrawFullRounds, ensureTreasuryBackfill, refundRound, TICKET_PRICE } from "@/lib/store";
import { getBalances, listIncomingUsdt, tron } from "@/lib/tron";
import { creditOnchain, settleTronDeposit } from "@/lib/tronDeposits";
import { getPayment } from "@/lib/nowpayments";
import { applyNowPayment } from "@/lib/nowpaymentsApply";
import { payoutConfig, processAutoPayouts } from "@/lib/payout";
import { feeConfig, feeQueue, processFeeSweeps } from "@/lib/fees";
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
      await sendMessage(chat, `🤖 <b>BETX autopilot</b>\n${text}`);
    } catch {
      /* best effort */
    }
  }
}

/* ------------------------------------------------------------- steps */

async function reconcileDeposits() {
  let credited = 0, expired = 0, nowpayments = 0;

  const stale = await db
    .update(deposits)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(deposits.provider, "tron"), eq(deposits.status, "waiting"), lt(deposits.createdAt, ago(5 * 60))))
    .returning({ id: deposits.id });
  expired += stale.length;

  if (tron.enabled) {
    const confirming = await db
      .select({ id: deposits.id })
      .from(deposits)
      .where(and(eq(deposits.provider, "tron"), eq(deposits.status, "confirming")))
      .limit(25);
    for (const d of confirming) {
      const r = await settleTronDeposit(d.id);
      if (r?.credited) credited++;
      if (r?.status === "expired") expired++;
    }
  }

  if (config.nowpayments.enabled) {
    const open = await db
      .select()
      .from(deposits)
      .where(
        and(
          eq(deposits.provider, "nowpayments"),
          eq(deposits.credited, false),
          isNotNull(deposits.paymentId),
          inArray(deposits.status, ["waiting", "confirming", "confirmed", "sending", "partially_paid"]),
          lt(deposits.updatedAt, ago(180)),
        ),
      )
      .limit(20);
    for (const d of open) {
      const res = await applyNowPayment(d, await getPayment(d.paymentId!));
      if (res === "credited") nowpayments++;
    }
    const abandoned = await db
      .update(deposits)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(deposits.provider, "nowpayments"),
          eq(deposits.status, "waiting"),
          isNull(deposits.paymentId),
          lt(deposits.createdAt, ago(24 * 3600)),
        ),
      )
      .returning({ id: deposits.id });
    expired += abandoned.length;
  }
  return { credited, nowpayments, expired };
}

/** Finds USDT that reached the deposit address and credits it automatically. */
async function scanIncoming() {
  if (!tron.enabled) return { skipped: "direct deposits disabled" };
  const st = await stateRow();
  const since = Math.max((st.scanCursor ?? Date.now() - 24 * 3600_000) - 10 * 60_000, Date.now() - 7 * 24 * 3600_000);
  const incoming = await listIncomingUsdt(tron.depositAddress, since);
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
        .values({ txHash: t.txid, fromAddress: t.from, amount: String(Number(t.units) / 10 ** tron.decimals), blockTime: new Date(t.blockTime) })
        .onConflictDoNothing()
        .returning();
      unmatched += ins.length;
    }
  }

  // a sender may link their wallet later — retry the parked transfers
  const parked = await db.select().from(unmatchedTransfers).limit(50);
  for (const p of parked) {
    const owner = (await db.select({ id: users.id }).from(users).where(eq(users.walletAddress, p.fromAddress)).limit(1))[0];
    if (!owner) continue;
    if (await creditOnchain(owner.id, p.txHash, p.fromAddress)) credited++;
    await db.delete(unmatchedTransfers).where(eq(unmatchedTransfers.txHash, p.txHash));
  }

  await db.update(automationState).set({ scanCursor: cursor || Date.now() }).where(eq(automationState.id, ID));
  if (unmatched > 0) await alert("unmatched", `📥 ${unmatched} USDT transfer(s) arrived from wallets not linked to any account. See /admin.`);
  return { seen: incoming.length, credited, unmatched };
}

/**
 * Safety net for the auto-draw: instantly draws EVERY open round that has
 * reached capacity. The buy flow already draws synchronously; this catches
 * anything missed (crash between sale and draw, manual DB edits, races).
 */
async function drawFullRounds() {
  await ensureTreasuryBackfill().catch(() => {});
  const outcomes = await autoDrawFullRounds();
  for (const o of outcomes) {
    await alert(
      `draw-${o.roundId}`,
      `🎰 Round ${o.roundId} auto-drawn: <b>${o.winnerName}</b> won $${o.prize.toFixed(2)} (${o.winningSerial}). $${o.fee.toFixed(2)} fee → treasury ${o.adminWallet}.`,
    );
  }
  return { drawn: outcomes.length, rounds: outcomes.map((o) => o.roundId) };
}

/** Settle accrued $5 round fees to the admin treasury wallet. */
async function settleFees() {
  const res = await processFeeSweeps(alert);
  return res;
}

/** Rounds that don't fill within ROUND_TIMEOUT_HOURS are closed and refunded. */
async function refundStaleRounds() {
  const hours = Number(process.env.ROUND_TIMEOUT_HOURS ?? 24);
  if (!(hours > 0)) return { skipped: "disabled" };
  const open = await db.select().from(rounds).where(eq(rounds.status, "open"));
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
  const [agg] = await db
    .select({
      spins: sql<string>`coalesce(sum(case when ${ledger.type} = 'spin' then ${ledger.amount} else 0 end), 0)`,
      referral: sql<string>`coalesce(sum(case when ${ledger.type} = 'referral' then ${ledger.amount} else 0 end), 0)`,
    })
    .from(ledger);
  const expectedVault = v ? Number(v.initialCapital) + Number(v.totalFees) - Number(agg.spins) - Number(agg.referral) : 0;
  const vaultDrift = v ? Math.round((Number(v.balance) - expectedVault) * 100) / 100 : 0;

  const [bal] = await db.select({ s: sql<string>`coalesce(sum(${users.balance}), 0)` }).from(users);
  const [pend] = await db
    .select({ s: sql<string>`coalesce(sum(${withdrawals.amount}), 0)`, c: sql<number>`count(*)::int` })
    .from(withdrawals)
    .where(inArray(withdrawals.status, ["pending", "processing"]));
  const liabilities = Math.round((Number(bal.s) + Number(pend.s)) * 100) / 100;

  let holdings: number | null = null;
  const cfg = payoutConfig();
  if (tron.enabled) {
    const dep = await getBalances(tron.depositAddress);
    const hot = cfg.hotWallet ? await getBalances(cfg.hotWallet) : { usdt: 0, trx: 0 };
    if (dep && hot) holdings = Math.round((dep.usdt + hot.usdt) * 100) / 100;
  }
  const [reviewQ] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(withdrawals)
    .where(and(eq(withdrawals.status, "pending"), isNotNull(withdrawals.reviewReason)));

  if (sendAlerts) {
    if (mism.rows.length) await alert("ledger-mismatch", `🚨 ${mism.rows.length} account(s) whose balance differs from the ledger. Payouts for them are held.`);
    if (Math.abs(vaultDrift) > 0.01) await alert("vault-drift", `⚠️ Vault drift of $${vaultDrift.toFixed(2)} vs. ledger.`);
    if (holdings !== null && holdings + 0.01 < liabilities) {
      await alert("solvency", `🚨 On-chain holdings $${holdings.toFixed(2)} are below player liabilities $${liabilities.toFixed(2)}.`);
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
  const [rd] = await db.select({ c: sql<number>`count(*)::int` }).from(rounds).where(and(eq(rounds.status, "drawn"), gte(rounds.drawnAt, since)));
  const [tk] = await db.select({ c: sql<number>`count(*)::int` }).from(tickets).where(gte(tickets.createdAt, since));
  const v = (await db.select().from(vault).limit(1))[0];
  const h = await healthChecks(false);
  await sendMessage(
    chat,
    [
      "📊 <b>BETX — last 24h</b>",
      `New players: <b>${u.c}</b>`,
      `Deposits: <b>$${Number(dp.s).toFixed(2)}</b> (${dp.c})`,
      `Withdrawals paid: <b>$${Number(wd.s).toFixed(2)}</b> (${wd.c})`,
      `Tickets: <b>${tk.c}</b> · Rounds drawn: <b>${rd.c}</b> · Fees: <b>$${(rd.c * 5).toFixed(2)}</b>`,
      `Vault: <b>$${Number(v?.balance ?? 0).toFixed(2)}</b>`,
      `Liabilities: $${h.liabilities.toFixed(2)}${h.holdings !== null ? ` · On-chain: $${h.holdings.toFixed(2)} ${h.solvent ? "✅" : "🚨"}` : ""}`,
      `Review queue: ${h.reviewQueue} · Ledger check: ${h.ledgerMismatches === 0 ? "✅" : "🚨 " + h.ledgerMismatches}`,
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
  if (!ok) await alert("job-error", `⚠️ Some automation steps failed:\n${errors.join("\n")}`);
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
  const fq = await feeQueue().catch(() => ({ rows: [], pending: 0, paid: 0 }));
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
    tron: { enabled: tron.enabled, network: tron.network, depositAddress: tron.depositAddress || null },
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
