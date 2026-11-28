# Read-only audit report — `http://localhost:3000/fa#pool`

## 1. Scope, baseline, runtime state

- Baseline: Git HEAD `fde5756`, working tree preserved. No source files were modified, created, deleted, or committed during the audit.
- `#pool` is browser-only scroll state: the server resolves `/fa`; the scroll target is `id="pool"` at `src\components\PoolBand.tsx:142` and `src\components\PoolBand.tsx:156`.
- Runtime verification was blocked: no local server responded. Read-only GETs to `/api/state`, `/api/rounds/state?tierCode=starter_1`, `/api/vault/onchain`, and `/api/tiers/progress` all returned `Unable to connect to the remote server`.
- Therefore: `$20.00`, `$0.77`, `0.002`, `$0.00`, Round `02`, `0/50`, and the rendered Persian strings are **runtime-unverified**. Findings below are code/config-verified facts plus explicit runtime assumptions.
- Current config read: `BETX_MODE=live`, `MAINTENANCE_MODE=false`, `NEXT_PUBLIC_MAINTENANCE_MODE=false`, `VAULT_INITIAL=20` in `.env.local:6-10`.

## 2. Routing and Persian UI claim audit

| Observed phrase | Source | Backend/code truth | Verdict |
|---|---|---|---|
| `حالت زنده` | `src\i18n\dictionaries\fa.ts:252`, shown by `src\components\Wallet.tsx:23` | Only means `BETX_MODE=live`/non-maintenance; `config.ts:143` hardcodes `paymentsEnabled:false`, so deposits/withdrawals are disabled regardless | Misleading in live mode |
| `عملیاتی (واقعی)` | `fa.ts:48`, `Hero.tsx:31-42` | `statusOnline` requires state + live + not demo + not maintenance; it does **not** check `vault.ledgerStatus` | Overstates verification state |
| `تأییدشده` / `زنده · تأییدشده` | `fa.ts:182`, `fa.ts:368`, `WinnersHistory.tsx:142` | `WinnersHistory` chooses `d.board.live` from `!preview && !maintenance`, not from proof verification | Unverified as rendered |
| `استخر فعال است` | `fa.ts:121`, rendered at `PoolBand.tsx:345` | Shows when not paused; purchase is separately blocked by `maintenance || isPreview` at `PoolBand.tsx:44-45` and `392-404` | Consistent with non-maintenance open pool |
| `فعال` / `جای خالی` | `fa.ts:117-118`, `PoolBand.tsx:301`, `PoolBand.tsx:306` | Seats are array-index display stubs (`PoolBand.tsx:150-153`), not persisted seat identities | UI label has no DB seat authority |
| `۳ روز` | `PoolBand.tsx:224` + `format.ts:56,66-68`; tier seed `4320` minutes (`20261126_m1_tier_policy_versions.sql:61-67`) | 4320 minutes formats to `۳ days`; FAQ says `۷۲ ساعت` at `fa.ts:684,702,714` | Numerically consistent; policy claims need Section 5 caveat |
| `SHA-256 تعهد + افشا` | `fa.ts:699` | Commitment/reveal exists (`store.ts:243-247`, `939-941`, `999-1023`) | True, but fairness strength is limited — Section 8 |

## 3. Maintenance Mode enforcement

**Switch implementation:** `src\lib\gameConfig.ts:51-55` reads `NEXT_PUBLIC_MAINTENANCE_MODE` first and only falls back to `MAINTENANCE_MODE`:

```ts
process.env.NEXT_PUBLIC_MAINTENANCE_MODE ?? process.env.MAINTENANCE_MODE
return raw !== "false";
```

Current env has both `false`, so maintenance is off. However, public env can override server env; a stale `NEXT_PUBLIC_MAINTENANCE_MODE=true` in a build can force maintenance even if server env is false, and `NEXT_PUBLIC_MAINTENANCE_MODE=false` can silently disable server-only maintenance. **High-severity configuration risk.**

**Blocked at route level:**

- Auth/account creation: `auth\connect\route.ts:17`, `auth\telegram\route.ts:14`
- Tickets: `tickets\buy\route.ts:14`
- Wheel: `wheel\spin\route.ts:15`
- Deposits/claims/verification/withdrawals: `wallet\deposit\route.ts:63,213`, `wallet\claim\route.ts:30`, `wallet\verify\route.ts:31`, `payments\withdraw\route.ts:15`
- Admin payouts/reconciliation: `admin\withdrawals\route.ts:43`, `admin\withdrawals\pay\route.ts:35`, `admin\fees\route.ts:53`, `admin\treasury\initialize\route.ts:15`
- Admin rounds/automation: `admin\rounds\open\route.ts:15`, `admin\rounds\[id]\review\route.ts:15`, `admin\rounds\[id]\settle\route.ts:15`, `admin\automation\route.ts:40`
- Automation/cron/webhook: `cron\route.ts:22`, `telegram\webhook\route.ts:100`

**Blocked at service level:** `assertMutationsOpen()` at `store.ts:43-45` is called by `rewardSignupReferral` `798`, `spinWheel` `848`, `approveRoundResult` `1109`, `settleApprovedRound` `1196`, `buyTickets` `1502`, `creditDeposit` `1644`, `requestWithdrawal` `1737`, and `processWithdrawal` `1786`. Tier admin has its own guard at `tierAdmin.ts:48-50`, used by create/update/status at `145`, `169`, `220`.

**Not blocked:**

- `account\route.ts:20-47` and `wallet\nonce\route.ts:32-61` mutate DB without maintenance checks; they are not financial transfers, but they are state-mutating.
- `autoDrawFullRounds()`/`autoDrawExpiredRounds()` at `store.ts:1068,1086` have no service-level guard; current callers are guarded through buy (`tickets\buy\route.ts:14`) or automation (`automation.ts:480-482`), so this is a defense-in-depth gap, not a proven active bypass.

UI is consistent: `PoolBand.tsx:82-85` refuses purchase, `239` disables empty seats, and `400-404` replaces buy labels with maintenance text.

## 4. Financial figures and source separation

| Value | Code source | Runtime status |
|---|---|---|
| Internal ledger `$20.00` | `.env.local:10` `VAULT_INITIAL=20`; initialized by `store.ts:522-561`; `/api/state` recomputes from ledger at `store.ts:1873-1886`, exposed at `2098-2115` | Runtime-unverified; code-consistent if seeded |
| On-chain USDC `$0.77` | `OnchainTreasury.tsx:22-57` fetches `/api/vault/onchain`; route at `vault\onchain\route.ts:11-35`; RPC read at `onchain.ts:42-60` | Runtime-unverified; UI will show unavailable if RPC fails |
| On-chain SOL `0.002` | `onchain.ts:55-57`: `lamports / 1e9` | Runtime-unverified |
| Treasury allocation `$0.00` | `store.ts:1877` sums settled `treasury_contribution` ledger entries only | Plausible if no settled rounds; runtime-unverified |
| Operational allocation `$0.00` | `store.ts:1879` sums settled `admin_gross_revenue` entries only | Plausible if no settled rounds; runtime-unverified |

Important separation:

- `/api\state\route.ts:8-24` returns `onchainTreasury.usdc:null`, `sol:null`, and `sourceEndpoint:"/api/vault/onchain"`. It does not own on-chain values.
- `balanceStatus.ts:9-17` labels `INTERNAL LEDGER` vs `ON-CHAIN`; `BalanceBadge.tsx:9-48` renders those labels.
- Demo/preview would show different figures: `demoSession.ts:274-275` uses `20`, but `demoSession.ts:329-330` preview balance is `12840`; current env says live, so preview should not be active.
- `ledgerStatus` is derived, not cryptographic: `store.ts:2109-2112` marks `verified` only if a `vault_seed` row exists and no legacy malformed financial rows exist.

## 5. Pool, ticket ownership, and 72-hour wording

- `Round 02 · 0/50` maps directly to `round.id`, `sold`, `capacity` at `PoolBand.tsx:168` and `store.ts:2116-2136`.
- Tickets are returned as an ordered array and mapped to visual stub index at `PoolBand.tsx:150-153`; there is no `seat_number` column in `tickets` (`schema.ts:124-144`). The UI seat number is positional only.
- Serial strength is good: `ticketSerial.ts:25-37` uses random bytes + SHA-256 checksum; `schema.ts:131` enforces uniqueness; `store.ts:1629-1632` retries collisions up to 5 times.
- Duplicate purchase control is weaker than schema hints: `schema.ts:35` has `maxUserPoolPercent` and `schema.ts:438-445` has `round_user_exposure`, but no enforcement appears in `buyTickets()` (`store.ts:1501-1635`). A user may buy multiple tickets; there is no per-user cap or exposed-cap check in the purchase path.
- Partial pools: `drawRound()` permits a partial draw after close if minimum participants are met (`store.ts:949-957`) and recalculates prize/fee at `store.ts:966-994`.
- **High-severity policy mismatch:** automation draws expired partial pools first (`automation.ts:497` via `autoDrawExpiredRounds`) and only then refunds stale open rounds (`automation.ts:499`, `333-344`). Once a partial round is drawn its status is `AWAITING_ADMIN_APPROVAL`, so `refundStaleRounds()` no longer sees it as `OPEN`. The FAQ/refund copy at `fa.ts:684,702,714-715` therefore overstates the practical 72-hour refund/rollover guarantee.
- Maintenance gating is correct end-to-end: client at `PoolBand.tsx:44-45,82-85,239,392-404`; route at `tickets\buy\route.ts:14`; service at `store.ts:1502`.

## 6. Tier math and migration consistency

`deriveTierAmounts()` (`tierMath.ts:19-40`) validates percentages sum to 100%, computes totals with `roundMoney()` (`tierAccounting.ts:18-21`), and derives admin as the remainder. Computed values:

| Tier | Price × cap | Total | Prize | Treasury | Admin | Fee |
|---|---:|---:|---:|---:|---:|---:|
| starter_1 | 1 × 50 | 50.00 | 37.50 | 7.50 | 5.00 | 12.50 |
| bronze_5 | 5 × 40 | 200.00 | 150.00 | 30.00 | 20.00 | 50.00 |
| silver_10 | 10 × 30 | 300.00 | 225.00 | 45.00 | 30.00 | 75.00 |
| gold_25 | 25 × 20 | 500.00 | 375.00 | 75.00 | 50.00 | 125.00 |
| platinum_50 | 50 × 20 | 1000.00 | 800.00 | 120.00 | 80.00 | 200.00 |
| diamond_100 | 100 × 15 | 1500.00 | 1200.00 | 180.00 | 120.00 | 300.00 |
| vip_whale_200 | 200 × 10 | 2000.00 | 1600.00 | 240.00 | 160.00 | 400.00 |

- Active tier seeds at `20261126_m1_tier_policy_versions.sql:61-67` match these prices, capacities, and percentages.
- `WINNER_AMOUNTS_BY_CODE` at `tierMath.ts:44-52` matches the derived prize column above.
- Latent inconsistency: `tier_policy_versions.winner_amounts_usd` seeded at `20261126_m1_tier_policy_versions.sql:72-80` uses older first-place amounts (`30`, `120`, `180`, `300`, `650`, `975`, `1300`), and `20261128_phase1_single_winner.sql:11-16` truncates to that stale first value. Settlement uses `deriveTierAmounts()` at `store.ts:1223`, not those policy rows, so payouts are not currently affected; but any future UI/rules reader that prefers `rules.winnerAmountsUsd` (`tierMath.ts:59-63`) could show stale amounts.
- Incomplete-pool settlement uses `amountsForTicketCount(tier, tickets.length)` (`store.ts:966,1223`), so actual partial payouts are pro-rata and can be far below the full-pool prize shown at `PoolBand.tsx:219`.

## 7. Weekly jackpot, growth allocation, and payouts

- `vaultAccounts.ts:1-16` defines 80% growth / 20% jackpot and `allocateVault()`.
- `rewardEngine.ts:38-41` gives 100% of the jackpot pot to one winner.
- `WeeklyJackpotWidget.tsx:43-45` derives the pot from `state.vault.totalFees`, i.e. cumulative settled treasury contributions, then applies the 80/20 split; `12-15` computes a client-side Sunday UTC countdown.
- `fa.ts:700,710,717-726` claims an 80/20 split, weekly reset, and 100% single winner.
- **High-severity implementation gap:** `weekly_jackpots` exists in `schema.ts:494-505`, but no backend weekly settlement/payout step was found. `automation.ts:480-503` has deposits, draws, fees, refunds, payouts, cleanup, health, and daily steps — no jackpot close/payout. The widget is a policy estimate, not an executed weekly pool.
- Referral commission is policy-only in the UI: `vaultAccounts.ts:52-62` requires settled/direct/KYC/no-refund; `fa.ts:729-732` claims 2%. Signup/free-spin referral credit is real at `store.ts:797-817`.
- Payout authorization is strong where enabled:
  - Settlement credits the winner’s internal balance only (`store.ts:1255`), after admin approval and verification (`store.ts:1205-1242`).
  - Withdrawal request debits user balance (`store.ts:1736-1776`).
  - Admin payment builds an unsigned operator transaction and verifies the broadcast tx signature/recipient on-chain before marking paid (`admin\withdrawals\pay\route.ts:47-74`, `store.ts:1779-1797`).
- However, `config.ts:143` hardcodes `paymentsEnabled:false`; deposit/withdraw routes reject with `paymentsDisabled` (`wallet\deposit\route.ts:66-68`, `payments\withdraw\route.ts:18-20`, `admin\withdrawals\pay\route.ts:38-40`). Fee sweeps are also paused (`config.ts:109-112`, `automation.ts:327-330`).

## 8. Draw fairness, verification, and prioritized conclusions

**What is genuinely implemented:**

- Server seed and SHA-256 commitment are created at round open (`store.ts:243-247`, `507-518`).
- Draw verifies `sha256(serverSeed) === seedHash` (`store.ts:939-941`), reveals the seed (`999-1023`), selects via `fairIndex(serverSeed, roundId, serials)` (`972`), and stores draw evidence (`1025-1036`).
- Public verification page recomputes commitment and winner (`verify\[round]\page.tsx:51-65`) and hides the seed until awaiting/approved/settled (`38-42`). `/api/state` exposes `serverSeed` only for settled winners (`store.ts:2138-2152`).
- Settlement rechecks stored draw, ticket count, participant count, ledger totals, and accounting amounts (`store.ts:1205-1242`).

**Material weaknesses:**

1. **Critical — live draws fail at evidence generation.** `drawRound()` always calls `writePhase2DrawEvidence()` (`store.ts:1025`). For opened rounds a commitment row exists (`store.ts:512-518`), so `writePhase2DrawEvidence()` calls `derivePhase2Draw()` (`phase2Runtime.ts:115-127`). In live mode, `derivePhase2Draw()` selects `failClosedVrfProvider` (`phase2Policy.ts:86-98`), whose `verify()` is always false and `randomBytes()` always throws (`drawRandomness.ts:40-49`). `drawDistinctWinners()` rejects failed verification (`drawRandomness.ts:151-152`). With `BETX_MODE=live`, a full/expired draw is expected to throw inside the transaction and roll back.
2. **High — “provably fair” overclaim.** Winner selection uses a server-generated seed (`store.ts:243-247`); `draw_commitments.clientSeed` is stored as `null` (`store.ts:1005`), schema default `clientSeedSource` is `EXTERNAL` (`schema.ts:160-161`) but Phase2 evidence writes `clientSeed:"phase2-hmac-v1"` and status `EVIDENCE_ONLY` (`phase2Runtime.ts:137-147`). There is no client seed or external randomness in the actual winner path.
3. **High — verification page scope is narrow.** It verifies seed hash + serial winner only (`verify\[round]\page.tsx:51-65`); it does not verify Phase2 proof, audit chain, integrity proof, settlement plan, or allocation. The displayed `✓` should not be read as full financial verification.
4. **High — maintenance switch precedence bug.** Public env overrides server env (`gameConfig.ts:51-55`).
5. **High — partial-pool refund ordering conflict.** Automation draws expired partial pools before refunds (`automation.ts:497,499`), contradicting 72-hour refund/rollover copy.
6. **Medium — live-mode payment claims conflict with hardcoded `paymentsEnabled:false`** (`config.ts:143`).
7. **Medium — stale `tier_policy_versions.winner_amounts_usd`** conflicts with current derived prizes (`20261126_m1_tier_policy_versions.sql:72-80`).
8. **Medium — verification/seat semantics:** visual seats are not durable identifiers (`PoolBand.tsx:150-153`), and per-user exposure caps are not enforced despite schema support.

**Bottom line:** the code contains substantial correctness controls for settlement authorization, serial uniqueness, commitment/reveal, and deployment safety, but the currently configured live mode is internally inconsistent: payments are disabled, Phase2 evidence generation is expected to block draws, public “verified/live” copy outruns what is actually verified, and the advertised weekly jackpot/refund policies are not fully implemented. No remediation was applied.
