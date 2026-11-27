# BETX Phase 9B — Admin Dashboard Independent Audit & Architecture

Date: 2026-11-26

## Scope and repository state

| Item | Status | Finding |
|---|---|---|
| Expected HEAD | **PASS** | `2178d6af148df771a24e2bcd4902b7b56dcddfe6` confirmed. |
| Working tree preservation | **PASS** | The audit itself was read-only and preserved the original 18 modified tracked files and 5 pre-existing untracked reports. The later Phase 9B.0 test-only step changed only `tests/phase6-admin.test.mjs` and `tests/regression-safety.test.mjs`; no source files were changed, deleted, restored, committed, or generated. The Phase 9B.0.1 architecture/planning task was read-only; this report update was made only after the user explicitly requested it. |
| Secret handling | **PASS** | `.env.local` was not read. No tokens, keys, credentials, or private values are reported. |
| Production financial access | **PASS** | No database migrations, RPC calls, broadcasts, transactions, deploys, or production services were accessed. |
| Overall Phase 9B readiness | **WARNING** | Server-side admin authorization is consistent and fail-closed, but UI coverage, localization, governance, and operational controls remain incomplete. Live runtime behavior is **NOT VERIFIED**. |

Phase 9A remains conditionally approved per `BETX-PHASE-9A2-EXECUTION-REPORT.md:111-121`. Its three go-live conditions were not re-verified because this audit was read-only and no working DB/browser run was performed.

Phase 9B.0 Stage 0 test work is now complete and verified; see §10. It added regression contracts only and did not implement any Phase 9B UI, backend, or financial feature.

Phase 9B.0.1 admin authentication architecture and read-only dashboard planning was completed read-only; see §11. No Phase 9B.1 implementation was started.

---

## 1. Existing admin pages and components

| Finding | Status | Evidence |
|---|---|---|
| Only one admin page exists: `/admin`, a fully client-rendered dashboard. | **PASS** | `src/app/admin/page.tsx:1`, `:29-248` |
| No `src/app/admin/layout.tsx`, `loading.tsx`, or `error.tsx`. | **WARNING** | Only `src/app/admin/page.tsx` exists. Global error boundary is localized to public pages: `src/app/[locale]/error.tsx:1-23`. |
| No admin component directory; all panels are inline in one 948-line file. | **WARNING** | Panels at `src/app/admin/page.tsx:280-347`, `:362-438`, `:449-596`, `:673-827`, `:845-899`, `:912-946` |
| Existing dependencies: React, Solana `Transaction`, `Logo`, `WalletProvider`. | **PASS** | `src/app/admin/page.tsx:3-6` |
| Admin token is entered client-side and stored in `sessionStorage`. | **WARNING** | `src/app/admin/page.tsx:44-75`, `:125-141` |
| Payout signing is client-side; no private key is sent to the server. | **PASS** | `src/app/admin/page.tsx:88-118`; API contract at `src/app/api/admin/withdrawals/pay/route.ts:22-27` |
| Admin page is hard-coded `dir="ltr" lang="en"` and bypasses the locale proxy. | **WARNING** | `src/app/admin/page.tsx:121`; proxy excludes `admin`: `src/proxy.ts:47-48` |
| Admin UI is not localized; no dictionary/provider is used. | **FAIL** | Imports at `src/app/admin/page.tsx:3-6`; hard-coded labels throughout, e.g. `:123`, `:148-157`, `:408-411`. |
| Several admin strings contain mojibake/encoding damage. | **WARNING** | `src/app/admin/page.tsx:111`, `:123`, `:410`, `:421` |
| Responsive layout exists but tables rely on horizontal scrolling only. | **WARNING** | Grids at `:146-159`, `:325-339`, `:710-735`; tables at `:792-823`, `:868-897` |

### Implemented panels

- Token sign-in and invalid-token handling: `src/app/admin/page.tsx:44-75`, `:125-142`
- Vault summary cards: `:146-159`
- Launch readiness/on-chain balance check: `:161`, `:280-347`
- Automation health, alerts, runs, unmatched transfers: `:163`, `:449-596`
- Fee/treasury transfer history: `:165`, `:362-438`
- Tier management: `:167`, `:673-827`
- Tier performance report: `:169`, `:845-899`
- Audit log: `:171`, `:912-946`
- Withdrawal review, reject/refund, wallet payout: `:200-232`
- Latest deposits: `:234-243`

---

## 2. Existing admin API endpoints and authorization

Authorization helper: `src/lib/admin.ts:7-28`. Tokens are read from `x-admin-token`, compared with `timingSafeEqual`, require expected length ≥16, and fail closed when missing. Roles are shared-secret roles (`ADMIN`, `VIEWER`), not user identities. Config getters are at `src/lib/config.ts:64-69`.

| Endpoint | Authorization | Purpose | Status |
|---|---|---|---|
| `GET /api/admin/withdrawals` | `isAdmin` only | Latest 100 withdrawals, 50 deposits, vault summary | **PASS** — `src/app/api/admin/withdrawals/route.ts:14-21` |
| `POST /api/admin/withdrawals` | `isAdmin` only | Only `action: "rejected"` accepted; refund + ledger + audit + notification | **PASS** — `withdrawals/route.ts:24-50` |
| `POST /api/admin/withdrawals/pay` | `isAdmin` + maintenance guard | Build unsigned tx from operator wallet; submit signed tx and mark paid only after on-chain verification | **WARNING** — `withdrawals/pay/route.ts:28-73`; effective verification at `src/lib/store.ts:1633-1648` |
| `GET /api/admin/fees` | `isAdmin` only | Fee config, queue totals, recent transfers | **PASS** — `src/app/api/admin/fees/route.ts:11-42` |
| `POST /api/admin/fees` | `isAdmin` + maintenance guard | Always returns 409; transfers paused | **PASS** — `fees/route.ts:44-52` |
| `GET /api/admin/automation` | `isAdmin` only | Automation status, health, readiness, on-chain treasury | **PASS** — `src/app/api/admin/automation/route.ts:14-23` |
| `POST /api/admin/automation` | `isAdmin` only | `evaluate` previews decisions; otherwise runs full automation as `admin` | **WARNING** — `automation/route.ts:25-38`; no maintenance guard |
| `GET /api/admin/audit` | `ADMIN` or `VIEWER` | Admin audit log, limit clamped 1–500 | **PASS** — `audit/route.ts:8-17`; `src/lib/adminAudit.ts:5-11` |
| `GET /api/admin/tiers` | `ADMIN` or `VIEWER` | List tiers | **PASS** — `tiers/route.ts:8-17` |
| `POST /api/admin/tiers` | `ADMIN` only | Create tier + audit | **PASS** — `tiers/route.ts:19-28` |
| `PATCH /api/admin/tiers/[id]` | `ADMIN` only | Update tier + audit | **PASS** — `tiers/[id]/route.ts:15-27` |
| `DELETE /api/admin/tiers/[id]` | `ADMIN` only | Soft-archive tier + audit | **PASS** — `tiers/[id]/route.ts:29-39` |
| `GET /api/admin/reports/tiers` | `ADMIN` or `VIEWER` | Tier performance report | **PASS** — `reports/tiers/route.ts:8-16` |
| `GET /api/admin/reports/reconciliation` | `isAdmin` only | Treasury/ledger/liability reconciliation, including on-chain read | **PASS** — `reports/reconciliation/route.ts:8-15`; logic `src/lib/treasuryAccounting.ts:92-309` |
| `POST /api/admin/treasury/initialize` | `isAdmin` only | Seeds vault/ledger if no vault exists | **WARNING** — `treasury/initialize/route.ts:8-15`; accounting side effect |
| `POST /api/admin/rounds/open` | `isAdmin` only | Opens a round + audit | **PASS** — `rounds/open/route.ts:8-26` |
| `POST /api/admin/rounds/[id]/review` | `isAdmin` only | Approve/reject; re-verifies seed/winner; rejection refunds | **PASS** — `rounds/[id]/review/route.ts:8-25`; `src/lib/store.ts:1017-1091` |
| `POST /api/admin/rounds/[id]/settle` | `isAdmin` only | Settlement with proof, amount, ledger, and prior-fee checks | **PASS** — `rounds/[id]/settle/route.ts:8-21`; `src/lib/store.ts:1093-1143` |
| `GET /api/telegram/setup` | `isAdmin` only | Mutates Telegram webhook/commands/menu via GET | **WARNING** — `src/app/api/telegram/setup/route.ts:12-52` |
| `GET /api/cron` | Separate `CRON_SECRET` Bearer check | Runs automation as cron | **PASS** — `src/app/api/cron/route.ts:9-31` |
| `GET /api/state` | Public | Public state plus fire-and-forget automation heartbeat | **WARNING** — `src/app/api/state/route.ts:7-12`; `src/lib/automation.ts:519-525` |

### Authorization verdict

- **PASS:** Every `/api/admin/*` handler checks authorization as its first executable statement. No missing handler-level auth was found.
- **PASS:** User sessions are HMAC-signed, expiry-checked, `httpOnly`, `sameSite: lax`, and conditionally `secure`: `src/lib/store.ts:662-716`.
- **WARNING:** Admin authorization is not tied to these sessions. It is a shared `x-admin-token` header from browser storage.
- **WARNING:** No per-operator identity. Audit `actor` is generic `"admin"`/`"viewer"` or a literal `"admin"` passed from routes: `src/lib/admin.ts:21-24`; `src/app/api/admin/tiers/route.ts:24`.
- **WARNING:** No rate limiting found on `/api/admin/*`.
- **WARNING:** Admin APIs bypass geo/locale proxy matching: `src/proxy.ts:47-48`; admin handlers do not call `assertRegion()` (`src/lib/api.ts:33-37`).

---

## 3. Missing UI features compared with available APIs

| Missing UI capability | Backend status | UI status | Classification |
|---|---|---|---|
| Round review queue with approve/reject | API exists | No calls to `/api/admin/rounds/*/review` in admin page | **FAIL** |
| Round settlement | API exists | No call to `/api/admin/rounds/*/settle` | **FAIL** |
| Open next round | API exists | No call to `/api/admin/rounds/open` | **FAIL** |
| Provably fair verification link/details from admin | Public verify page exists | Not linked from admin | **WARNING** |
| Treasury/ledger reconciliation report | API exists | No call to `/api/admin/reports/reconciliation` | **FAIL** |
| Treasury vault initialization | API exists | Not surfaced | **WARNING** — should remain deliberately gated |
| Tier `DELETE`/archive via API | API exists | UI archives via `PATCH {status:"ARCHIVED"}` instead | **WARNING** — `src/app/admin/page.tsx:765-775`, `:817` |
| Tier `rules` editing | Field exists in schema/type | Not editable: field list omits `rules` at `src/app/admin/page.tsx:641-654` | **WARNING** |
| Admin user management | No API and no schema fields for admin-controlled status/role/ban | Absent | **FAIL** coverage gap |
| Viewer-role dashboard | Three read endpoints allow `VIEWER` | Dashboard first fetches ADMIN-only withdrawals, so viewer sees no panels: `src/app/admin/page.tsx:44-65`, `:144-245` | **FAIL** |
| Search/filter/sort/pagination | APIs use fixed limits | No controls in UI | **WARNING** |
| Admin localization | Public dictionaries exist | Admin hard-coded English/LTR | **FAIL** |
| Admin loading/error route boundaries | Not applicable | Missing `/admin/loading.tsx` and `/admin/error.tsx` | **WARNING** |

Fixed truncation currently hides older records:

- Withdrawals 100, deposits 50: `src/app/api/admin/withdrawals/route.ts:16-21`
- Fee transfers 50, UI shows 15: `src/app/api/admin/fees/route.ts:16`; `src/app/admin/page.tsx:423`
- Audit requested 100: `src/app/admin/page.tsx:918`
- Alerts/runs sliced to 8: `src/app/admin/page.tsx:566`, `:575`

---

## 4. Security and operational risks

| Risk | Status | Evidence / impact |
|---|---|---|
| Shared admin token stored in `sessionStorage` | **WARNING** | XSS/extension exposure; no rotation, expiry, logout, or per-operator identity: `src/app/admin/page.tsx:59`, `:67-75` |
| No server-side `/admin` page gate | **WARNING** | Page is client-only; privileged data still requires API auth, so this is not a direct data leak: `src/app/admin/page.tsx:1` |
| No admin endpoint rate limiting | **WARNING** | Token strength controls exist, but online guessing/abuse throttling is absent. |
| Generic audit actor | **WARNING** | Multiple operators sharing `ADMIN_TOKEN` cannot be distinguished: `src/lib/admin.ts:21-24` |
| Read actions are not audited | **WARNING** | Admin GET endpoints have no audit writes. |
| Public heartbeat can trigger automation | **WARNING** | `GET /api/state` calls `after(maybeRunAutomation)`; full runner includes draws, refunds, fees, payouts: `src/app/api/state/route.ts:7-12`; `src/lib/automation.ts:496-504` |
| `POST /api/admin/automation` lacks maintenance guard | **WARNING** | Other mutation paths check `config.maintenanceMode`; automation run does not: `src/app/api/admin/automation/route.ts:26-38` |
| Manual payout trust boundary | **WARNING** | Build trusts client-supplied `from`; effective gate is confirmed on-chain transfer from configured treasury to exact address/amount. `expectedTxId` is set to a blockhash and is not used as the final check: `src/app/api/admin/withdrawals/pay/route.ts:39-58`; `src/lib/store.ts:1633-1648` |
| State-changing `GET /api/telegram/setup` | **WARNING** | Mutates remote config via GET; vulnerable to accidental prefetch/cache semantics: `src/app/api/telegram/setup/route.ts:21-49` |
| Admin APIs bypass geo middleware | **WARNING** | `src/proxy.ts:47-48`; admin handlers do not assert region. |
| Schema drift in historical provider/network defaults | **WARNING / NOT VERIFIED** | Drizzle uses Solana/USDC while baseline SQL uses nowpayments/USDT/TRC20: `src/db/schema.ts:210`, `:215`, `:234` vs `supabase/schema.sql:15`, `:20`, `:273`. Runtime DB truth was not queried. |
| Financial fail-closed defaults | **PASS** | Maintenance default ON, `paymentsEnabled: false`, `autoSweep: false`: `src/lib/config.ts:87-94`, `:111-125`; auto payouts hard-disabled with no key exposure: `src/lib/payout.ts:5-20`; regression guards at `tests/regression-safety.test.mjs` |
| Blockchain code modification | **PASS** | No blockchain/accounting source was modified. |
| Live DB/RPC/session behavior | **NOT VERIFIED** | No production or isolated DB/RPC invocation was performed; integration tests remain environment-gated. |

---

## 5. Proposed admin dashboard architecture

Design proposal only; nothing below was implemented.

### Server boundary

- Add a server-rendered `src/app/admin/layout.tsx` that performs a server-side admin session/role check before rendering privileged navigation. This must not be a client-only `RoleGate`.
- Preserve existing API authorization unchanged during migration. If an HttpOnly admin session is introduced, require it **in addition to** existing per-handler checks until a deliberate migration is approved.
- Derive `actor` from an authenticated operator identity, not a shared role string, before expanding audit-sensitive actions.

### Route structure

```text
src/app/admin/
  layout.tsx                 server auth gate + shell/navigation
  page.tsx                   redirect/overview
  loading.tsx
  error.tsx
  overview/page.tsx          read-only KPIs and health
  rounds/page.tsx            read-only queue + result proof links
  users/page.tsx             read-only search; no restrictions UI until API exists
  treasury/page.tsx          read-only fees/reconciliation
  reports/page.tsx           read-only reports
  audit/page.tsx             read-only action history
  settings/page.tsx          tier management and admin config
```

### Shared components

```text
src/components/admin/
  AdminShell.tsx
  AdminNav.tsx
  AdminDataTable.tsx         reusable filters, sorting, pagination
  Panel.tsx
  ReadOnlyPanel.tsx          visually distinct, no action controls
  ActionPanel.tsx            ADMIN-only, explicit confirmation
  ConfirmActionDialog.tsx
  StatusBadge.tsx
  EmptyState.tsx
  LoadingState.tsx
  ErrorState.tsx
  ProofLink.tsx              links to public /verify/[round]
```

### Client data layer

- Centralize fetch logic in `src/lib/admin/client.ts`.
- Keep `cache: "no-store"` for all admin reads.
- Do not place role checks in this client layer as a security control; it is only for UX.
- Add per-panel abort controllers to avoid stale polling after unmount or role change.

### Policy layer

- Add a server-side permission matrix, e.g. `src/lib/admin/permissions.ts`, mapping role → endpoint → read/action.
- `VIEWER` should receive read-only navigation. Do not silently broaden `VIEWER` access to financial monitoring; either keep those panels `ADMIN`-only or add explicit sanitized read endpoints after policy review.
- Tier changes, round review/settle, withdrawal reject/refund, payout, treasury init, and automation run must remain `ADMIN` and action-gated.

---

## 6. Suggested implementation order

| Stage | Scope | Classification |
|---|---|---|
| 0 | Freeze Phase 9A files; add contract tests around current auth/financial safety. No UI feature work. | **PASS — completed in Phase 9B.0** |
| 1 | Server shell, navigation, `loading.tsx`, `error.tsx`, shared panel/table primitives. Read-only only. | **PASS precondition** |
| 2 | Wire read-only reconciliation, round queue, and public verify links. No mutation buttons. | **WARNING — read-only** |
| 3 | Improve audit log: filters, pagination, safe `details` rendering, actor/action/entity drill-down. | **WARNING — read-only** |
| 4 | Migrate tier management into shared components; add `rules` display; preserve existing server validation/audit. | **WARNING — protected config** |
| 5 | Define admin user-management API/schema in a separate design decision before building any UI. No client-only restrictions. | **FAIL coverage gap until designed** |
| 6 | Last: action UX for round open/review/settle, withdrawal reject/refund, payout, treasury init. Each requires explicit confirmation, server revalidation, maintenance/kill-switch checks, idempotency, and audit. Keep disabled by default. | **FAIL until separately approved** |

Do not implement stages involving financial actions in Phase 9B.

---

## 7. Tests required for each implementation stage

| Stage | Required tests |
|---|---|
| 0 | **COMPLETED:** Extended `tests/phase6-admin.test.mjs` with admin-route auto-discovery, auth-first assertions, exact ADMIN/VIEWER policy, fail-closed token checks, client-boundary checks, automation evaluate-vs-run separation, and documented-risk guards. Extended `tests/regression-safety.test.mjs` with payments/auto-sweep/maintenance fail-closed invariants. `npm run typecheck`, `npm run lint`, targeted tests, and `npm test` pass. |
| 1 | Source tests for server layout guard existence, no client-only authorization, presence of loading/error boundaries, and localized labels in admin shell. Run `npm run typecheck`, `npm run lint`, `npm test`. |
| 2 | API contract tests for reconciliation and round-read payload shape; assert no POST/PATCH/DELETE calls in read-only components; assert viewer cannot access ADMIN-only financial reads; assert links point only to public verify routes. |
| 3 | Audit tests: limit clamping, filter/pagination validation, safe rendering of JSON `details`, no raw token/key rendering, actor/action/entity assertions. |
| 4 | Tier form tests: allocation validation parity with `src/lib/tierAdmin.ts`, `rules` preserved rather than overwritten, audit actor passed from server, no direct DB writes from client. |
| 5 | Local isolated DB integration tests for user search/restriction APIs: no ban/suspend write without ADMIN, restrictions enforced by `assertCanPlay`/deposit validation, audit written, no client-only state. |
| 6 | Action tests: idempotency, stale-state rejection, maintenance guard, kill-switch, broadcast authorization, on-chain verification before `paid`, proof re-verification before approve/settle, audit attribution, and viewer denial. Keep safety assertions from `tests/regression-safety.test.mjs`. |
| Final | `npm run typecheck`, `npm run lint`, `npm test`. Do **not** run `npm run build` in the workspace because `scripts/build-sw.cjs` writes `public/sw.js`; use an isolated copy if a build is required. |

---

## 8. Files expected to change in future implementation

No source files were changed by this audit or by the Phase 9B.0 test-only step. Future implementation would likely touch:

```text
src/app/admin/**                         new layout, error, loading, route segments
src/components/admin/**                  new shared UI primitives
src/lib/admin/client.ts                  new centralized admin fetch layer
src/lib/admin/permissions.ts             new server-side policy matrix
src/lib/admin/session.ts                 only if HttpOnly admin session is approved
src/lib/adminAudit.ts                    filters/pagination/detail shaping
src/i18n/dictionaries/{en,ar,es,fa,ru,tr}.ts  admin dictionaries
tests/phase6-admin.test.mjs              extended in Phase 9B.0; further UI contract tests later
tests/phase9b-admin.test.mjs             not added; avoided package.json script changes
BETX-PHASE-9B-*.md / .txt                existing audit reports updated with Phase 9B.0 results
```

Potentially touched only by separate, explicitly approved backend work:

```text
src/app/api/admin/withdrawals/route.ts
src/app/api/admin/automation/route.ts
src/app/api/admin/audit/route.ts
src/app/api/admin/reports/reconciliation/route.ts
src/app/api/admin/tiers/**
```

Must remain untouched by Phase 9B UI work unless a separate financial-safety review approves changes:

```text
src/lib/store.ts
src/lib/treasuryAccounting.ts
src/lib/automation.ts
src/lib/solana.ts
src/lib/payout.ts
src/lib/fees.ts
supabase/**
drizzle.config.json
public/sw.js
package.json                             avoid unless a new test script is required
```

---

## 9. Read-only financial reporting vs actual financial actions

| Operation | Classification | Required UI treatment |
|---|---|---|
| Withdrawal/deposit list | **Read-only reporting** | Plain table; no mutation controls; ADMIN-only until policy says otherwise. |
| Fee transfer history | **Read-only reporting** | Show paused state; no transfer form. |
| Automation status/health/readiness | **Read-only reporting** | Polling is acceptable; no action controls in this panel. |
| Tier performance report | **Read-only reporting** | Safe for `VIEWER` under current API policy. |
| Audit log | **Read-only reporting** | Safe for `VIEWER`; no sensitive token/key rendering. |
| Reconciliation report | **Read-only reporting** | ADMIN-only; performs on-chain read only; no mutation. |
| Public `/verify/[round]` | **Read-only reporting** | Public by design; no auth required. |
| Withdrawal reject/refund | **Financial action** | `ADMIN` only, explicit confirm, server-side state/ownership check, ledger/audit write. |
| Withdrawal pay build/submit | **Financial action / broadcast** | `ADMIN` only, maintenance + broadcast kill-switch, client wallet signing, on-chain verification before `paid`. |
| Automation `evaluate` | **Read-only preview** | Must not mutate; label clearly as dry run. |
| Automation `run` | **Operational action** | `ADMIN` only; may draw/refund/sweep/pay; require maintenance guard and explicit confirmation. |
| Round open | **Operational action affecting pool** | `ADMIN` only; explicit confirm; audit. |
| Round review approve/reject | **Financial action** | `ADMIN` only; proof re-verification; rejection refunds users. |
| Round settle | **Financial action** | `ADMIN` only; amount, ledger, winner, and fee checks; audit. |
| Treasury initialize | **Accounting side effect** | `ADMIN` only; must remain gated. |
| Tier create/update/archive | **Protected financial configuration** | `ADMIN` only; allocations must sum to 100%; audit. |
| Telegram setup | **External configuration mutation** | `ADMIN` only; should be POST in future, not GET. |

---

## 10. Phase 9B.0 test-only update (completed)

| Item | Status | Result |
|---|---|---|
| Files changed in 9B.0 | **PASS** | Only `tests/phase6-admin.test.mjs` and `tests/regression-safety.test.mjs`. No application source, schema, migration, `package.json`, or `public/sw.js` change. |
| Admin route discovery | **PASS** | All 13 `/api/admin/**/route.ts` files are auto-discovered; exported HTTP methods are compared against an explicit policy map. |
| Auth-first contracts | **PASS** | Every handler must authorize as its first executable statement; no pre-auth request-body reads, awaits, DB calls, or financial side effects are allowed. |
| Role-policy contracts | **PASS** | ADMIN/VIEWER access matches the documented endpoint policy; shared-secret roles remain distinct from user identity. |
| Fail-closed token contracts | **PASS** | Missing, invalid, and undersized tokens fail closed; `timingSafeEqual`, minimum length 16, and both token getters are asserted. |
| Client-boundary contracts | **PASS** | `/admin` remains client-rendered, stores the token in `sessionStorage`, imports no server auth helper, and contains no `"use server"` bypass. Server routes still import `@/lib/admin`. Existing UTF-8 BOM in the page is tolerated. |
| Automation contracts | **PASS** | `evaluate` is separated from execution and contains no mutation/broadcast/settlement calls; `run` remains a distinct ADMIN path. Missing maintenance guard, public `/api/state` heartbeat, and generic shared audit actor remain documented but unfixed. |
| Financial invariants | **PASS** | `paymentsEnabled: false`, `autoSweep` returns `false`, maintenance defaults through `isMaintenanceMode()`, ambiguous `BETX_MODE` fails closed, and automatic payouts stay hard-disabled with no key exposure. |
| Typecheck | **PASS** | `npm run typecheck`. |
| Lint | **PASS** | `npm run lint`. |
| Targeted tests | **PASS** | `node --experimental-strip-types --test tests/phase6-admin.test.mjs tests/regression-safety.test.mjs`: 24 tests, 24 pass, 0 fail. |
| Full suite | **PASS** | `npm test`: 48 tests, 46 pass, 0 fail, 2 skipped. Skipped tests are environment-gated PostgreSQL integration tests requiring `BETX_TEST_DATABASE_URL` and the local TLS harness. |
| Build | **NOT RUN** | Intentionally not run because `scripts/build-sw.cjs` writes `public/sw.js`; use an isolated copy if a build is required. |
| Production access | **PASS** | No database migration, RPC call, broadcast, transaction, deploy, or production service was accessed. |
| Git state | **PASS** | Phase 9B.0 added only the two test-file modifications on top of the preserved 18 tracked Phase 9A files and untracked reports. No commit, push, reset, clean, merge, or deploy. |

Non-blocking pre-existing warnings (`MODULE_TYPELESS_PACKAGE_JSON` and pure-JS `bigint` fallback) remain; they did not affect the results.

---

## 11. Phase 9B.0.1 admin authentication architecture and implementation plan (completed)

This section records a security-reviewed architecture and planning task only. It is not permission to start Phase 9B.1.

| Item | Status | Result |
|---|---|---|
| Scope | **PASS** | Architecture/planning only. No UI, backend, auth, database, schema, migration, package, financial, or generated-file changes were made. |
| HEAD | **PASS** | `2178d6af148df771a24e2bcd4902b7b56dcddfe6` confirmed before and after. |
| Current architecture | **PASS** | Static shared `ADMIN_TOKEN` / `ADMIN_VIEWER_TOKEN`, read only from `x-admin-token`; raw token stored in browser `sessionStorage`; API handlers remain the real security boundary. A server layout cannot read `sessionStorage`. Evidence: `src/lib/config.ts:64-69`, `src/lib/admin.ts:7-28`, `src/app/admin/page.tsx:1`, `:44-75`. |
| Proposed architecture | **PASS** | Individual operators, server-side hashed sessions, `__Host-betx-admin` HttpOnly/Secure/SameSite=Strict cookie, expiry/revocation/rotation, CSRF, rate limiting, operator audit actor, and additive API compatibility. |
| Permission matrix | **PASS** | VIEWER remains limited to current audit/tier list/tier report reads; no implicit expansion. ADMIN-only privileged reads and all operational/financial actions remain gated. |
| Read-only stages | **PASS** | Stage A auth prerequisite; Stage 1 shell/nav/boundaries/localization; Stage 2 reconciliation/round queue/proof links; Stage 3 audit filters/pagination; Stage 4 cutover and cleanup. |
| Mandatory gates | **WARNING** | Public automation heartbeat, automation maintenance guard, admin rate limiting, operator identity, Telegram GET mutation, geo bypass, schema drift, and payout verification must be remediated before their corresponding financial enablement. |
| Tests | **PASS** | Per-stage auth/session, CSRF, rate-limit, read-only route, localization, audit, and financial-invariant tests defined; extend existing test files to avoid `package.json` changes. |
| Production access | **PASS** | No production DB/RPC, migration, broadcast, transaction, deploy, secret read, or financial operation occurred. |
| Git state | **PASS** | Same 20 modified tracked files and 7 untracked reports before and after the planning task; no commit, push, reset, clean, merge, or deploy. |

### 11.1 Current authentication architecture

- `ADMIN_TOKEN` and `ADMIN_VIEWER_TOKEN` are raw env shared secrets: `src/lib/config.ts:64-69`.
- `getAdminRole()` reads only `x-admin-token`, requires expected length ≥16, and uses `timingSafeEqual`: `src/lib/admin.ts:7-19`.
- Roles are shared-secret roles, not operator identities: `src/lib/admin.ts:16-24`.
- `/admin` is fully client-rendered; raw token is stored in `sessionStorage` as `betx_admin`: `src/app/admin/page.tsx:1`, `:44-75`.
- No admin cookie, login/logout, expiry, revocation, rotation, CSRF defense, rate limiting, or per-operator actor exists.
- Proxy excludes `admin` and `api`: `src/proxy.ts:47-48`.
- Ordinary user sessions already provide reusable patterns: signed cookie, HMAC, expiry, HttpOnly/SameSite/Secure flags: `src/lib/store.ts:148`, `:662-716`.
- A server layout cannot authenticate a value stored only in browser `sessionStorage`; it needs a server-readable cookie.

### 11.2 Proposed secure architecture

1. Add individual `admin_operators` records with unique identity, `ADMIN`/`VIEWER` role, hashed password, MFA reference, status, failed-attempt metadata, and `session_version`.
2. Add `admin_sessions` records containing a hash of an opaque 256-bit session token, operator ID, role snapshot, CSRF hash, absolute/idle expiry, revocation state, and rotation lineage.
3. Login endpoint verifies identity/MFA, applies per-IP and per-subject rate limits, creates a session, and sets `__Host-betx-admin` with `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, no `Domain`, short `Max-Age`, and `Cache-Control: no-store`.
4. Every server request reads the cookie, hashes the token, validates session/operator state, and returns an admin context containing `operatorId`, `actor`, `role`, `sessionId`, and `csrfToken`.
5. `src/app/admin/layout.tsx` may redirect on missing/invalid context but must not fetch privileged data or replace API checks.
6. Every admin API handler continues to authorize as its first executable statement through `isAdmin()` / `requireAdminRole()`.
7. Cookie-authenticated mutations require CSRF token validation plus Origin/Referer/Sec-Fetch-Site checks.
8. Logout marks the session revoked and clears the cookie; privilege/password changes increment `session_version`; emergency revocation can invalidate one session, one operator, or one role.
9. During migration, `src/lib/admin.ts` may temporarily accept a valid cookie or an explicitly allowlisted legacy service header; after migration, remove the header path and rotate old shared tokens.
10. Audit actor becomes the authenticated operator, never a shared role string and never client-supplied.

### 11.3 Permission matrix

| Surface | VIEWER | ADMIN | Class | Gates |
|---|---:|---:|---|---|
| `/admin` shell | Limited read-only shell only if explicitly implemented | Full shell | UX | Viewers must not bootstrap ADMIN-only endpoints. |
| Vault / treasury status | X | R | R | ADMIN-only APIs; layout is not the boundary. |
| Withdrawals / deposits list | X | R | R | `GET /api/admin/withdrawals`. |
| Withdrawal reject/refund | X | F | F | Session, CSRF, rate limit, operator actor, audit. |
| Payout / broadcast | X | F | F | Maintenance guard, broadcast kill-switch, on-chain verification. |
| Audit log | R | R | R | Existing VIEWER permission preserved. |
| Tier list / tier report | R | R | R | Existing VIEWER permissions preserved. |
| Tier create/update/archive | X | F | F | Financial configuration; ADMIN only. |
| Reconciliation | X | R | R | ADMIN-only on-chain read report. |
| Round queue | X | R | R | Proposed read-only GET only. |
| Round open/review/settle | X | O/F | O/F | Proof re-verification, audit, no VIEWER expansion. |
| Automation evaluate | X | R | R | Preview only; ADMIN-only until policy says otherwise. |
| Automation execute | X | O/F | O/F | Maintenance guard and explicit confirmation mandatory. |
| Treasury initialization | X | F | F | Gated accounting side effect. |
| Fee transfer | X | F, disabled | F | Currently paused with 409. |

### 11.4 Read-only implementation stages

| Stage | Scope | Boundary |
|---|---|---|
| A | Auth prerequisite: operator/session records, login/logout/refresh, cookie, CSRF, rate limiting, actor plumbing. | Separate security stage before a real server layout gate; not Phase 9B.1 UI. |
| 1 | Server shell, navigation, `loading.tsx`, `error.tsx`, localized provider and dictionary keys. | No privileged fetch in layout; no mutation controls. |
| 2 | Read-only reconciliation, read-only round queue, public verification links. | GET-only; no review/settle/open/run/pay controls. |
| 3 | Audit filters and pagination. | Prefer client-side filtering; sanitize details; no token/key rendering. |
| 4 | Cutover and cleanup. | Remove `sessionStorage`, raw headers, and all financial action controls from read-only dashboard. |

### 11.5 Exact expected file changes

| Area | Files | Responsibility |
|---|---|---|
| Auth prerequisite | `supabase/migrations/<timestamp>_admin_auth.sql`, `src/db/schema.ts` | Operator/session tables and equivalent Drizzle definitions. |
| Auth prerequisite | `src/lib/admin/session.ts`, `src/lib/admin/password.ts`, `src/lib/admin.ts` | Session issue/verify/rotate/revoke, password hashing, canonical admin context, API compatibility. |
| Auth prerequisite | `src/app/api/admin/auth/login/route.ts`, `logout/route.ts`, `refresh/route.ts` | Rate-limited login/MFA, CSRF logout, optional rotation. |
| Auth prerequisite | `src/app/api/telegram/setup/route.ts`, `src/lib/admin/client.ts`, `src/app/admin/page.tsx` | Convert state-changing GET to POST; centralized cookie/CSRF fetch; remove raw-token client flow. |
| Shell | `src/app/layout.tsx`, `src/app/admin/layout.tsx`, `loading.tsx`, `error.tsx` | Locale resolution, server shell, route boundaries. |
| Components | `src/components/admin/AdminShell.tsx`, `AdminNav.tsx`, `Panel.tsx`, `LoadingState.tsx`, `ErrorState.tsx`, `EmptyState.tsx`, `StatusBadge.tsx` | Read-only primitives and localized shell. |
| Localization | `src/i18n/dictionaries/{en,fa,ar,es,ru,tr}.ts` | Canonical `admin` namespace and parity across all locales. |
| Read-only pages | `src/app/admin/page.tsx`, `reconciliation/page.tsx`, `rounds/page.tsx`, `audit/page.tsx` | Read-only overview/panels; no actions. |
| Panels | `src/components/admin/ReconciliationPanel.tsx`, `RoundQueuePanel.tsx`, `ProofLink.tsx`, `AuditTable.tsx` | Read-only rendering, public proof links, audit filters. |
| New read API | `src/app/api/admin/rounds/queue/route.ts`, `src/lib/adminRoundQueue.ts` | Auth-first GET-only queue endpoint and read-only query shaping. |
| Optional audit backend | `src/app/api/admin/audit/route.ts`, `src/lib/adminAudit.ts` | Validated filters/pagination only if client-side limits are insufficient. |
| Tests | `tests/phase6-admin.test.mjs`, `tests/phase7-ui.test.mjs`, `tests/regression-safety.test.mjs`, `tests/postgres-regressions.test.mjs` | Auth/session contracts, locale parity, financial invariants, isolated DB session lifecycle. |

### 11.6 Risks and mandatory gates

| Risk | Mandatory before |
|---|---|
| Public `/api/state` automation heartbeat | Any automation execution or financial enablement. |
| Missing maintenance guard on `POST /api/admin/automation` | Automation run, draws, refunds, sweeps, payouts. |
| Missing admin API rate limiting | Admin login, cookie migration, and all financial operations. |
| Shared admin identity | Any audit-sensitive or financial operation. |
| State-changing `GET /api/telegram/setup` | Cookie-based CSRF deployment and external config mutation. |
| Admin geo-policy bypass | Any financial/admin enablement if geo policy applies. |
| Financial schema drift | Any financial operation or generated migration. |
| Manual payout verification concerns | Payout, broadcast, or withdrawal automation enablement. |

### 11.7 Tests required per stage

| Stage | Required tests |
|---|---|
| Auth prerequisite | Cookie flags; hashed session storage; expiry/idle timeout; revocation; rotation; session-version invalidation; CSRF rejection; Origin/Referer checks; per-IP/per-subject limits; operator actor; API auth first; legacy header compatibility/removal. |
| Shell/boundaries | Layout/loading/error existence; server layout; no `sessionStorage`; no privileged layout fetch; no `"use server"` bypass; no secret leakage. |
| Localization | Admin key parity for `fa/en/ar/es/ru/tr`; RTL for `fa`/`ar`; no hard-coded labels or mojibake; provider present. |
| Read-only panels | New queue route GET-only and auth-first; no mutation calls in read-only components; reconciliation has no controls; proof links only to public verify routes. |
| Audit | Filter/pagination validation; safe JSON details; no token/key rendering; actor/session labels safe. |
| Final | No admin token in client storage; no action controls in read-only dashboard; financial invariants unchanged; `npm run typecheck`, `npm run lint`, `npm test`; do not run `npm run build` in the workspace. |

---

## Final classification

- **PASS:** HEAD integrity; preservation of Phase 9A changes; server-side authorization on all existing `/api/admin/*` handlers; constant-time token comparison; fail-closed token validation; signed user sessions; no secret exposure; financial kill-switches remain disabled; Phase 9B.0 Stage 0 contract tests completed and passing; Phase 9B.0.1 auth architecture/planning completed read-only.
- **WARNING:** Admin session governance, shared identity, missing rate limiting, public automation heartbeat, no maintenance guard on automation run, fixed data limits, partial responsive behavior, reconciliation not wired, accounting schema drift not runtime-verified.
- **FAIL:** Admin UI coverage for round lifecycle and reconciliation; no admin user-management API/UI; viewer experience incompatible with dashboard boot sequence; admin localization absent.
- **NOT VERIFIED:** Live database state, real on-chain balances, actual transaction broadcast, production environment configuration, browser-level responsive rendering, and Phase 9A go-live conditions.

**Recommendation:** Proceed only with the read-only architecture and contract-test stages first. Do not implement or enable withdrawals, deposits, purchases, draws, payouts, fee sweeps, Solana broadcasting, or treasury mutations in Phase 9B.

No Phase 9B features were implemented. Phase 9B.0 added test-only regression coverage; Phase 9B.0.1 added architecture/planning only; no UI, backend, financial, schema, or `package.json` changes. Phase 9B.1 was not started.
