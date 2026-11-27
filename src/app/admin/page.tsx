"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Transaction } from "@solana/web3.js";
import { Logo } from "@/components/Logo";
import { WalletProvider, useWallet, walletErrorMessage } from "@/components/WalletProvider";

interface W {
  id: number;
  username: string;
  amount: string;
  address: string;
  status: string;
  txHash: string | null;
  reviewReason: string | null;
  auto: boolean;
  createdAt: string;
}
interface D {
  id: number;
  userId: number;
  provider: string;
  amountUsd: string;
  status: string;
  credited: boolean;
  createdAt: string;
}

export default function AdminPage() {
  return (
    <WalletProvider>
      <AdminInner />
    </WalletProvider>
  );
}

function AdminInner() {
  const wallet = useWallet();
  const [paying, setPaying] = useState<number | null>(null);
  const [token, setToken] = useState("");
  const [data, setData] = useState<{ withdrawals: W[]; deposits: D[]; vault: { balance: number; totalFees: number; adminEarnings: number } } | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async (t: string) => {
    setErr("");
    try {
      const res = await fetch("/api/admin/withdrawals", { headers: { "x-admin-token": t }, cache: "no-store" });
      const json = await res.json();
      if (res.status === 403) {
        setErr("Invalid operations token.");
        setData(null);
        return;
      }
      if (!res.ok || !json.ok) {
        setErr("Data temporarily unavailable.");
        setData(null);
        return;
      }
      sessionStorage.setItem("betx_admin", t);
      setData(json);
    } catch {
      setErr("Data temporarily unavailable.");
      setData(null);
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem("betx_admin");
    if (!saved) return;
    const id = window.setTimeout(() => {
      setToken(saved);
      void load(saved);
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const act = async (id: number, action: "rejected") => {
    const res = await fetch("/api/admin/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ id, action }),
    });
    const json = await res.json();
    if (!json.ok) setErr(json.error || "Error");
    await load(token);
  };

  const payWithWallet = async (id: number) => {
    if (!wallet.address) return setErr("Connect your payout wallet first.");
    setPaying(id);
    setErr("");
    try {
      const call = async (body: unknown) => {
        const res = await fetch("/api/admin/withdrawals/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-token": token },
          body: JSON.stringify(body),
        });
        const j = await res.json();
        if (!j.ok) throw new Error(j.error || "failed");
        return j;
      };
      const built = await call({ step: "build", id, from: wallet.address });
      const serialized = built.transaction?.serializedTransactionBase64;
      if (!serialized) throw new Error("Invalid Solana transaction");
      const transaction = Transaction.from(
        Uint8Array.from(atob(serialized), (c) => c.charCodeAt(0)),
      );
      const signed = await wallet.signTransaction(transaction);
      const sent = await call({ step: "submit", id, signedTransaction: signed });
      setErr(`Paid OK ${sent.txid}`);
      await load(token);
    } catch (e) {
      setErr(walletErrorMessage(e));
    } finally {
      setPaying(null);
    }
  };

  return (
    <main dir="ltr" lang="en" className="mx-auto min-h-screen max-w-5xl px-4 py-10 text-left sm:px-6">
      <Logo />
      <h1 className="mt-8 text-3xl font-black text-white">Operations · Withdrawals</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(token);
        }}
        className="mt-6 flex gap-3"
      >
        <input
          dir="ltr"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ADMIN_TOKEN"
          className="focus-ring flex-1 rounded-xl border border-rule bg-black/30 px-4 py-3 text-sm text-white"
        />
        <button className="btn-neon focus-ring rounded-xl px-6 py-3 font-bold">Sign in</button>
      </form>
      {err ? <p className="mt-3 text-sm text-red-400">{err}</p> : null}

      {data ? (
        <>
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="panel rounded-2xl p-5">
              <p className="micro text-mint">VAULT</p>
              <p dir="ltr" className="font-display mt-1 text-2xl text-white">${data.vault.balance.toFixed(2)}</p>
            </div>
            <div className="panel rounded-2xl p-5">
              <p className="micro text-mint">TREASURY ALLOCATED</p>
              <p dir="ltr" className="font-display mt-1 text-2xl text-foil">${data.vault.totalFees.toFixed(2)}</p>
            </div>
            <div className="panel rounded-2xl p-5">
              <p className="micro text-mint">BETX PLATFORM FEES</p>
              <p dir="ltr" className="font-display mt-1 text-2xl text-foil">${data.vault.adminEarnings.toFixed(2)}</p>
            </div>
          </div>

          <ReadinessPanel token={token} vaultBalance={data.vault.balance} />

          <AutomationPanel token={token} />

          <FeesPanel token={token} />

          <TierManagementPanel token={token} />

          <TierReportsPanel token={token} />

          <AuditLogPanel token={token} />

          <div className="panel mt-6 flex flex-wrap items-center gap-3 rounded-2xl p-5">

            <p className="micro text-mint">PAYOUT WALLET (USDC-SPL)</p>
            {wallet.address ? (
              <>
                <code className="font-display text-sm text-neon-2">{wallet.address}</code>
                <button onClick={() => wallet.disconnect()} className="text-xs text-mint hover:text-white">disconnect</button>
              </>
            ) : (
              wallet.wallets
                .filter((w) => w.readyState === "Found")
                .map((w) => (
                  <button
                    key={w.name}
                    onClick={() => wallet.connect(w.name).catch((e) => setErr(walletErrorMessage(e)))}
                    className="flex items-center gap-2 rounded-lg border border-rule px-3 py-2 text-sm text-white hover:border-mint/50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={w.icon} alt="" className="h-5 w-5 rounded" /> {w.name}
                  </button>
                ))
            )}
            {!wallet.address && wallet.ready && wallet.wallets.every((w) => w.readyState !== "Found") ? (
              <span className="text-xs text-mint">Install a Solana wallet to pay withdrawals from your own wallet.</span>
            ) : null}
          </div>

          <div className="panel mt-6 overflow-hidden rounded-2xl">
            {data.withdrawals.length === 0 ? <p className="p-6 text-mint">No requests.</p> : null}
            {data.withdrawals.map((w) => (
              <div key={w.id} className="border-b border-rule/60 p-5 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-white">
                    #{w.id}  · {w.username}  ·{" "}
                    <span dir="ltr" className="font-display text-foil">${Number(w.amount).toFixed(2)}</span>
                  </p>
                  <span className="micro text-mint">{w.status}</span>
                </div>
                <p dir="ltr" className="font-display mt-2 break-all text-[12px] text-neon-2">{w.address}</p>
                {w.reviewReason ? <p className="mt-1 text-[12px] text-foil">Review: {w.reviewReason}</p> : null}
                {w.status === "processing" ? <p className="mt-1 text-[12px] text-neon-2">Auto payout in flight — confirming on-chain…</p> : null}
                {w.status === "pending" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => payWithWallet(w.id)}
                      disabled={!wallet.address || paying !== null}
                      className="btn-foil rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
                    >
                      {paying === w.id ? "Confirm in wallet…" : "Pay with wallet"}
                    </button>
                    <button onClick={() => act(w.id, "rejected")} className="rounded-lg border border-rule px-4 py-2 text-sm text-mint">
                      Reject & refund
                    </button>
                  </div>
                ) : w.txHash ? (
                  <p dir="ltr" className="mt-2 text-[11px] text-mint">tx: {w.txHash}</p>
                ) : null}
              </div>
            ))}
          </div>

          <h2 className="mt-10 text-xl font-black text-white">Latest deposits</h2>
          <div className="panel mt-4 overflow-hidden rounded-2xl text-[13px]">
            {data.deposits.map((d) => (
              <div key={d.id} className="flex justify-between border-b border-rule/50 px-5 py-3 last:border-b-0">
                <span className="text-mint">#{d.id}  · user {d.userId}  · {d.provider}</span>
                <span className="text-mint">{d.status}{d.credited ? " OK" : ""}</span>
                <span dir="ltr" className="font-display text-white">${Number(d.amountUsd).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}

/* ------------------------------------------------------------------ autopilot */

interface Auto {
  status: {
    lastRunAt: string | null;
    ageSeconds: number | null;
    lastError: string | null;
    alerts: { key: string; at: string; text: string }[];
    runs: { id: number; trigger: string; ok: boolean; durationMs: number; createdAt: string; error: string | null }[];
    unmatched: { txHash: string; fromAddress: string; amount: string; blockTime: string }[];
    payout: { enabled: boolean; keyConfigured: boolean; keyValid: boolean; hotWallet: string | null; maxPerTx: number; dailyMax: number };
    roundTimeoutHours: number;
    tron: { enabled: boolean; network: string; depositAddress: string | null };
  };
  health: {
    ledgerMismatches: number;
    vaultDrift: number;
    liabilities: number;
    holdings: number | null;
    solvent: boolean | null;
    pendingWithdrawals: number;
    reviewQueue: number;
  };
}

interface Readiness {
  readiness: { ready: boolean; checks: { key: string; ok: boolean; level: "critical" | "warning"; detail: string }[] };
  onchain: { address: string; status: string; usdc?: number | null; usdt?: number | null; sol?: number | null; trx?: number | null; fetchedAt: string; explorerUrl: string } | null;
}

function ReadinessPanel({ token, vaultBalance }: { token: string; vaultBalance: number }) {
  const [r, setR] = useState<Readiness | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/automation", { headers: { "x-admin-token": token }, cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setR(null);
        setUnavailable(true);
        return;
      }
      setR({ readiness: j.readiness, onchain: j.onchain });
      setUnavailable(false);
    } catch {
      setR(null);
      setUnavailable(true);
    }
  }, [token]);
  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const id = window.setInterval(load, 60000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [load]);
  if (!r) {
    return (
      <div role={unavailable ? "alert" : "status"} className="panel mt-6 rounded-2xl px-5 py-8 text-sm text-mint">
        {unavailable ? "Data temporarily unavailable." : "Loading readiness data…"}
      </div>
    );
  }
  const oc = r.onchain;
  const onchainBalance = oc ? (oc.usdc ?? oc.usdt ?? null) : null;
  const diff = oc && onchainBalance !== null ? Math.round((onchainBalance - vaultBalance) * 100) / 100 : null;
  return (
    <div className="panel mt-6 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-black text-white">Launch readiness</p>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${r.readiness.ready ? "bg-neon/15 text-neon-2" : "bg-red-500/15 text-red-300"}`}>
          {r.readiness.ready ? "READY FOR LIVE" : "NOT READY — fix critical items"}
        </span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {r.readiness.checks.map((c) => (
          <p key={c.key} className="flex items-start gap-2 rounded-lg border border-rule bg-black/25 px-3 py-2 text-xs">
            <span className={c.ok ? "text-neon-2" : c.level === "critical" ? "text-red-300" : "text-foil"}>{c.ok ? "OK" : c.level === "critical" ? "FAIL" : "!"}</span>
            <span className="min-w-0">
              <span className="font-bold text-white">{c.key}</span> <span className="break-all text-mint">{c.detail}</span>
            </span>
          </p>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
        <Stat k="LEDGER VAULT" v={`$${vaultBalance.toFixed(2)}`} />
        <Stat k="ON-CHAIN TREASURY (USDC)" v={oc && onchainBalance !== null ? `$${onchainBalance.toFixed(2)}  · ${oc.status}` : oc ? oc.status : "n/a"} bad={!oc || oc.status === "unavailable" || oc.status === "invalid"} />
        <Stat k="ON-CHAIN - LEDGER" v={diff === null ? "n/a" : `${diff >= 0 ? "+" : ""}$${diff.toFixed(2)}`} bad={diff !== null && diff < 0} />
      </div>
      {oc ? (
        <p className="mt-2 break-all text-xs text-mint">
          <a href={oc.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-neon-2 hover:underline">{oc.address} ↗</a>  · checked {new Date(oc.fetchedAt).toLocaleTimeString()}
        </p>
      ) : null}
    </div>
  );
}

interface FeeRow {
  id: number;
  roundId: number;
  amount: number;
  adminWallet: string;
  status: string;
  txHash: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: string | null;
  paidAt: string | null;
}

function FeesPanel({ token }: { token: string }) {
  const [data, setData] = useState<{
    config: { autoSweep: boolean; adminWallet: string; hotWallet: string | null; threshold: number; max: number };
    pending: number;
    paid: number;
    transfers: FeeRow[];
  } | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/fees", { headers: { "x-admin-token": token }, cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setData(null);
        setUnavailable(true);
        return;
      }
      setData(j);
      setUnavailable(false);
    } catch {
      setData(null);
      setUnavailable(true);
    }
  }, [token]);

  useEffect(() => {
    const first = window.setTimeout(refresh, 0);
    const id = window.setInterval(refresh, 20000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [refresh]);

  if (!data) {
    return (
      <div role={unavailable ? "alert" : "status"} className="panel mt-6 rounded-2xl px-5 py-8 text-sm text-mint">
        {unavailable ? "Data temporarily unavailable." : "Loading treasury data…"}
      </div>
    );
  }

  return (
    <div className="panel mt-6 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-black text-white">Treasury transfers</p>
        <span className="micro text-mint">
          TRANSFERS PAUSED  · HISTORICAL RECONCILIATION REQUIRED
        </span>
      </div>
      <p className="mt-2 break-all text-xs text-mint">
        BETX fee wallet: <code className="text-neon-2">{data.config.adminWallet}</code>
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
        <Stat k="ACCRUED PENDING" v={`$${data.pending.toFixed(2)}`} bad={data.pending > 0} />
        <Stat k="SETTLED ON-CHAIN" v={`$${data.paid.toFixed(2)}`} />
        <Stat k="TRANSFERS" v={String(data.transfers.length)} />
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-rule">
        {data.transfers.length === 0 ? <p className="px-4 py-3 text-xs text-mint">No treasury transfer records.</p> : null}
        {data.transfers.slice(0, 15).map((f) => (
          <div key={f.id} className="border-b border-rule/50 px-4 py-3 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-white">
                Round #{f.roundId}  · <span className="font-display text-foil">${f.amount.toFixed(2)}</span>
              </span>
              <span className={f.status === "paid" ? "text-neon-2" : "text-foil"}>{f.status}</span>
            </div>
            {f.txHash ? <p className="mt-1 break-all font-display text-[11px] text-mint">tx: {f.txHash}</p> : null}
            {f.lastError ? <p className="mt-1 text-[11px] text-red-300">{f.lastError}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="rounded-xl border border-rule bg-black/25 px-4 py-3">
      <p className="micro text-mint">{k}</p>
      <p className={`font-display mt-1 text-lg ${bad ? "text-red-400" : "text-white"}`}>{v}</p>
    </div>
  );
}

function AutomationPanel({ token }: { token: string }) {
  const [auto, setAuto] = useState<Auto | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [actionError, setActionError] = useState("");
  const [preview, setPreview] = useState<{ id: number; amount: number; user: string; ok: boolean; reason?: string }[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/automation", { headers: { "x-admin-token": token }, cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setAuto(null);
        setUnavailable(true);
        return;
      }
      setAuto(j);
      setUnavailable(false);
    } catch {
      setAuto(null);
      setUnavailable(true);
    }
  }, [token]);

  useEffect(() => {
    const first = window.setTimeout(refresh, 0);
    const id = window.setInterval(refresh, 20000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [refresh]);

  const call = async (action: "run" | "evaluate") => {
    setBusy(true);
    setActionError("");
    try {
      const res = await fetch("/api/admin/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ action }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setActionError("Data temporarily unavailable.");
        return;
      }
      if (action === "evaluate") setPreview(j.decisions);
      await refresh();
    } catch {
      setActionError("Data temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  };

  if (!auto) {
    return (
      <div role={unavailable ? "alert" : "status"} className="panel mt-6 rounded-2xl px-5 py-8 text-sm text-mint">
        {unavailable ? "Data temporarily unavailable." : "Loading automation data…"}
      </div>
    );
  }
  const { status: st, health: h } = auto;
  const healthy = st.ageSeconds !== null && st.ageSeconds < 300 && !st.lastError;

  return (
    <div className="panel mt-6 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${healthy ? "bg-neon-2 shadow-[0_0_12px_rgba(53,255,176,0.8)]" : "bg-foil"}`} />
          <p className="text-lg font-black text-white">Autopilot</p>
          <p className="text-xs text-mint">
            {st.lastRunAt ? `last run ${st.ageSeconds}s ago` : "never ran"}  · round timeout {st.roundTimeoutHours}h  · Solana {st.tron.network}
            {st.tron.enabled ? "" : " (direct deposits off)"}
          </p>
        </div>
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => call("evaluate")} className="rounded-lg border border-rule px-3 py-2 text-xs text-mint hover:text-white disabled:opacity-50">
            Preview payout decisions
          </button>
          <button disabled={busy} onClick={() => call("run")} className="btn-neon rounded-lg px-4 py-2 text-xs font-bold disabled:opacity-50">
            {busy ? "Running…" : "Run now"}
          </button>
        </div>
      </div>
      {actionError ? <p role="alert" className="mt-3 text-xs text-red-300">{actionError}</p> : null}
      {st.lastError ? <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{st.lastError}</p> : null}

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat k="LEDGER CHECK" v={h.ledgerMismatches === 0 ? "OK" : `${h.ledgerMismatches} mismatch`} bad={h.ledgerMismatches > 0} />
        <Stat k="VAULT DRIFT" v={`$${h.vaultDrift.toFixed(2)}`} bad={Math.abs(h.vaultDrift) > 0.01} />
        <Stat k="LIABILITIES" v={`$${h.liabilities.toFixed(2)}`} />
        <Stat k="ON-CHAIN" v={h.holdings === null ? "n/a" : `$${h.holdings.toFixed(2)}`} bad={h.solvent === false} />
        <Stat k="PENDING WD" v={String(h.pendingWithdrawals)} />
        <Stat k="REVIEW QUEUE" v={String(h.reviewQueue)} bad={h.reviewQueue > 0} />
        <Stat k="AUTO PAYOUT" v={st.payout.enabled ? `ON <=$${st.payout.maxPerTx}` : st.payout.keyConfigured && !st.payout.keyValid ? "BAD KEY" : "OFF"} bad={st.payout.keyConfigured && !st.payout.keyValid} />
        <Stat k="DAILY CAP" v={`$${st.payout.dailyMax}`} />
      </div>
      {st.payout.hotWallet ? <p className="mt-2 text-xs text-mint">Hot wallet: <code className="text-neon-2">{st.payout.hotWallet}</code></p> : null}

      {preview ? (
        <div className="mt-4 rounded-xl border border-rule">
          <p className="micro border-b border-rule px-4 py-2 text-mint">PAYOUT DECISIONS (dry run)</p>
          {preview.length === 0 ? <p className="px-4 py-3 text-xs text-mint">No pending withdrawals.</p> : null}
          {preview.map((p) => (
            <p key={p.id} className="border-b border-rule/50 px-4 py-2 text-xs last:border-b-0">
              #{p.id} {p.user} ${p.amount.toFixed(2)} {"->"} <span className={p.ok ? "text-neon-2" : "text-foil"}>{p.ok ? "auto-pay" : `review: ${p.reason}`}</span>
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-rule">
          <p className="micro border-b border-rule px-4 py-2 text-mint">ALERTS</p>
          {st.alerts.length === 0 ? <p className="px-4 py-3 text-xs text-mint">No alerts. All good.</p> : null}
          {st.alerts.slice(0, 8).map((a) => (
            <p key={a.key} className="border-b border-rule/50 px-4 py-2 text-xs text-white last:border-b-0">
              <span className="text-mint">{new Date(a.at).toLocaleString()}  · </span>
              {a.text}
            </p>
          ))}
        </div>
        <div className="rounded-xl border border-rule">
          <p className="micro border-b border-rule px-4 py-2 text-mint">RECENT RUNS</p>
          {st.runs.slice(0, 8).map((r) => (
            <p key={r.id} className="flex justify-between gap-3 border-b border-rule/50 px-4 py-2 text-xs last:border-b-0">
              <span className={r.ok ? "text-neon-2" : "text-red-300"}>{r.ok ? "OK" : "FAIL"} {r.trigger}</span>
              <span className="text-mint">{r.durationMs} ms  · {new Date(r.createdAt).toLocaleTimeString()}</span>
            </p>
          ))}
        </div>
      </div>

      {st.unmatched.length ? (
        <div className="mt-3 rounded-xl border border-foil/30">
          <p className="micro border-b border-rule px-4 py-2 text-foil">UNMATCHED TRANSFERS (sender wallet not linked to any account)</p>
          {st.unmatched.map((u) => (
            <p key={u.txHash} className="border-b border-rule/50 px-4 py-2 text-xs last:border-b-0">
              ${Number(u.amount).toFixed(2)} from <code className="text-neon-2">{u.fromAddress}</code>  · {new Date(u.blockTime).toLocaleString()}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

async function adminJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", "x-admin-token": token, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || "Data temporarily unavailable.");
  return json as T;
}

interface TierRow {
  id: number;
  code: string;
  name: string;
  priceUsd: string;
  ticketCapacity: number;
  drawDurationMinutes: number;
  prizePercentage: string;
  treasuryPercentage: string;
  adminPercentage: string;
  minimumParticipants: number;
  maximumParticipants: number | null;
  status: string;
  displayOrder: number;
  rules: Record<string, unknown>;
}

type TierForm = {
  code: string;
  name: string;
  priceUsd: string;
  ticketCapacity: string;
  drawDurationMinutes: string;
  prizePercentage: string;
  treasuryPercentage: string;
  adminPercentage: string;
  minimumParticipants: string;
  maximumParticipants: string;
  status: string;
  displayOrder: string;
};

const TIER_FIELDS: Array<[keyof TierForm, string]> = [
  ["code", "CODE"],
  ["name", "NAME"],
  ["priceUsd", "PRICE USD"],
  ["ticketCapacity", "CAPACITY"],
  ["drawDurationMinutes", "DRAW MINUTES"],
  ["prizePercentage", "PRIZE %"],
  ["treasuryPercentage", "TREASURY %"],
  ["adminPercentage", "BETX FEE %"],
  ["minimumParticipants", "MIN PLAYERS"],
  ["maximumParticipants", "MAX PLAYERS"],
  ["status", "STATUS"],
  ["displayOrder", "ORDER"],
];

function tierToForm(tier?: TierRow): TierForm {
  return {
    code: tier?.code ?? "",
    name: tier?.name ?? "",
    priceUsd: tier?.priceUsd ?? "1",
    ticketCapacity: String(tier?.ticketCapacity ?? 20),
    drawDurationMinutes: String(tier?.drawDurationMinutes ?? 1440),
    prizePercentage: tier?.prizePercentage ?? "75",
    treasuryPercentage: tier?.treasuryPercentage ?? "15",
    adminPercentage: tier?.adminPercentage ?? "10",
    minimumParticipants: String(tier?.minimumParticipants ?? 1),
    maximumParticipants: tier?.maximumParticipants === null || tier?.maximumParticipants === undefined ? "" : String(tier.maximumParticipants),
    status: tier?.status ?? "INACTIVE",
    displayOrder: String(tier?.displayOrder ?? 0),
  };
}

function TierEditor({ token, tier, onDone, onCancel }: {
  token: string;
  tier?: TierRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<TierForm>(() => tierToForm(tier));
  const [err, setErr] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      const payload = {
        code: form.code,
        name: form.name,
        priceUsd: Number(form.priceUsd),
        ticketCapacity: Number(form.ticketCapacity),
        drawDurationMinutes: Number(form.drawDurationMinutes),
        prizePercentage: Number(form.prizePercentage),
        treasuryPercentage: Number(form.treasuryPercentage),
        adminPercentage: Number(form.adminPercentage),
        minimumParticipants: Number(form.minimumParticipants),
        maximumParticipants: form.maximumParticipants ? Number(form.maximumParticipants) : null,
        status: form.status,
        displayOrder: Number(form.displayOrder),
      };
      await adminJson(tier ? `/api/admin/tiers/${tier.id}` : "/api/admin/tiers", token, {
        method: tier ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl border border-rule p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {TIER_FIELDS.map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="micro text-mint">{label}</span>
            {key === "status" ? (
              <select
                value={form[key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                className="rounded-lg border border-rule bg-black/30 px-3 py-2 text-sm text-white"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            ) : (
              <input
                value={form[key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                className="rounded-lg border border-rule bg-black/30 px-3 py-2 text-sm text-white"
              />
            )}
          </label>
        ))}
      </div>
      {err ? <p className="mt-3 text-sm text-red-400">{err}</p> : null}
      <div className="mt-4 flex gap-2">
        <button className="btn-neon rounded-lg px-4 py-2 text-sm font-bold">{tier ? "Save tier" : "Create tier"}</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-rule px-4 py-2 text-sm text-mint">Cancel</button>
      </div>
    </form>
  );
}

function TierManagementPanel({ token }: { token: string }) {
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [editing, setEditing] = useState<{ tier?: TierRow } | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const json = await adminJson<{ tiers: TierRow[] }>("/api/admin/tiers", token);
      setTiers(json.tiers);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }, [token]);

  useEffect(() => {
    const id = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const setStatus = async (tier: TierRow, status: string) => {
    try {
      await adminJson(`/api/admin/tiers/${tier.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <div className="panel mt-6 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black text-white">Tier management</h2>
        <button onClick={() => setEditing({})} className="btn-foil rounded-lg px-4 py-2 text-sm font-bold">New tier</button>
      </div>
      {err ? <p className="mt-3 text-sm text-red-400">{err}</p> : null}
      {editing ? (
        <TierEditor
          token={token}
          tier={editing.tier}
          onCancel={() => setEditing(null)}
          onDone={() => { setEditing(null); void load(); }}
        />
      ) : null}
      <div className="mt-4 overflow-x-auto rounded-xl border border-rule">
        <table className="w-full min-w-[720px] text-left text-xs text-mint">
          <thead className="border-b border-rule text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2">Tier</th>
              <th className="px-4 py-2">Price</th>
              <th className="px-4 py-2">Capacity</th>
              <th className="px-4 py-2">Allocations</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => (
              <tr key={tier.id} className="border-b border-rule/50 last:border-b-0">
                <td className="px-4 py-3 text-white">{tier.code} · {tier.name}</td>
                <td className="px-4 py-3">${Number(tier.priceUsd).toFixed(2)}</td>
                <td className="px-4 py-3">{tier.ticketCapacity}</td>
                <td className="px-4 py-3">{tier.prizePercentage}/{tier.treasuryPercentage}/{tier.adminPercentage}</td>
                <td className="px-4 py-3">{tier.status}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setEditing({ tier })} className="rounded border border-rule px-2 py-1 text-white">Edit</button>
                    <button onClick={() => setStatus(tier, "ACTIVE")} disabled={tier.status === "ACTIVE"} className="rounded border border-rule px-2 py-1 text-neon-2 disabled:opacity-40">Activate</button>
                    <button onClick={() => setStatus(tier, "INACTIVE")} disabled={tier.status === "INACTIVE"} className="rounded border border-rule px-2 py-1 text-foil disabled:opacity-40">Pause</button>
                    <button onClick={() => setStatus(tier, "ARCHIVED")} disabled={tier.status === "ARCHIVED"} className="rounded border border-rule px-2 py-1 text-red-300 disabled:opacity-40">Archive</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface TierReportRow {
  tierId: number;
  code: string;
  name: string;
  status: string;
  priceUsd: number;
  capacity: number;
  openRounds: number;
  settledRounds: number;
  ticketsSold: number;
  ticketRevenue: number;
  prizeObligation: number;
  treasuryObligation: number;
  adminObligation: number;
}

function TierReportsPanel({ token }: { token: string }) {
  const [rows, setRows] = useState<TierReportRow[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const json = await adminJson<{ report: TierReportRow[] }>("/api/admin/reports/tiers", token);
      setRows(json.report);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }, [token]);

  useEffect(() => {
    const id = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  return (
    <div className="panel mt-6 rounded-2xl p-5">
      <h2 className="text-xl font-black text-white">Tier reports</h2>
      {err ? <p className="mt-3 text-sm text-red-400">{err}</p> : null}
      <div className="mt-4 overflow-x-auto rounded-xl border border-rule">
        <table className="w-full min-w-[720px] text-left text-xs text-mint">
          <thead className="border-b border-rule text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2">Tier</th>
              <th className="px-4 py-2">Open</th>
              <th className="px-4 py-2">Settled</th>
              <th className="px-4 py-2">Tickets</th>
              <th className="px-4 py-2">Revenue</th>
              <th className="px-4 py-2">Prize</th>
              <th className="px-4 py-2">Treasury</th>
              <th className="px-4 py-2">BETX Fee</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.tierId} className="border-b border-rule/50 last:border-b-0">
                <td className="px-4 py-3 text-white">{row.code} · {row.name}</td>
                <td className="px-4 py-3">{row.openRounds}</td>
                <td className="px-4 py-3">{row.settledRounds}</td>
                <td className="px-4 py-3">{row.ticketsSold}</td>
                <td className="px-4 py-3">${row.ticketRevenue.toFixed(2)}</td>
                <td className="px-4 py-3">${row.prizeObligation.toFixed(2)}</td>
                <td className="px-4 py-3">${row.treasuryObligation.toFixed(2)}</td>
                <td className="px-4 py-3">${row.adminObligation.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  entity: string;
  entityId: number;
  details: unknown;
  createdAt: string;
}

function AuditLogPanel({ token }: { token: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const json = await adminJson<{ entries: AuditEntry[] }>("/api/admin/audit?limit=100", token);
      setEntries(json.entries);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }, [token]);

  useEffect(() => {
    const id = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  return (
    <div className="panel mt-6 rounded-2xl p-5">
      <h2 className="text-xl font-black text-white">Audit log</h2>
      {err ? <p className="mt-3 text-sm text-red-400">{err}</p> : null}
      <div className="mt-4 rounded-xl border border-rule">
        {entries.length === 0 ? <p className="p-4 text-sm text-mint">No entries.</p> : null}
        {entries.map((entry) => (
          <div key={entry.id} className="border-b border-rule/50 px-4 py-3 text-xs last:border-b-0">
            <span className="text-mint">{new Date(entry.createdAt).toLocaleString()} · </span>
            <span className="text-white">{entry.actor}</span> · {entry.action} · {entry.entity}#{entry.entityId}
          </div>
        ))}
      </div>
    </div>
  );
}


