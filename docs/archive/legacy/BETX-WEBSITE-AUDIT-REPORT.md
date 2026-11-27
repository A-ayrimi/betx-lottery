# BETX Website Audit

**Scope:** READ-ONLY source audit of `F:\betx-lottery-main`. No files, database state, schemas, migrations, financial logic, tests, Git state, or deployment state were changed. No browser/visual viewport testing was performed, so responsive findings are static-code-only.

## 1. Executive summary

- BETX has **9 page route templates**: **8 public/user-facing** localized route templates and **1 admin page**.
- With 6 supported locales (`en`, `es`, `fa`, `ar`, `tr`, `ru`), the 8 public route templates render as **48 concrete localized URLs**. See `src/i18n/config.ts:1`.
- `/` is not a standalone page; it is internally rewritten to `/{locale}` by `src/proxy.ts:33-36`.
- Navigation links are mostly coherent: header anchor links, footer links, legal links, install links, and verification links point to existing sections or routes.
- Major UI problems remain:
  - Admin APIs exist for round review/settle/open, treasury initialization, and reconciliation, but matching admin UI controls were not found.
  - Deposit/withdrawal UI exists but is hard-disabled by `paymentsEnabled=false` and maintenance defaults.
  - Several localized routes are hardcoded English/LTR, including `/[locale]/verify/[round]`.
  - 404/error/maintenance banners are only partially localized.
  - Public copy conflicts with actual gating and configurable tier data.
- Prior Phase 8 and evidence reconciliation audits concluded **NOT PRODUCTION READY**. This website audit does not change that verdict.

## 2. Total number of public pages

- **8 public page route templates**:
  - `/[locale]`
  - `/[locale]/install`
  - `/[locale]/verify`
  - `/[locale]/verify/[round]`
  - `/[locale]/terms`
  - `/[locale]/privacy`
  - `/[locale]/responsible-gaming`
  - `/[locale]/restricted`
- **48 concrete public localized URLs** because each template supports 6 locales.
- `/` is a rewrite entry point, not a separate page file.
- Special UI files such as `not-found.tsx` and `[locale]/error.tsx` are not counted as normal public pages.

## 3. Total number of admin pages

- **1 admin page template**: `/admin` at `src/app/admin/page.tsx`.
- Admin is excluded from locale proxying at `src/proxy.ts:47-48`.
- The admin page is English-only/LTR, with forced attributes at `src/app/admin/page.tsx:121`.

## 4. Total number of user pages

- **8 user-facing page templates**, same as the public page count.
- These include game/home, install, verification, verification detail, legal, privacy, responsible gaming, and geo-restriction pages.
- There is **no standalone `/account` page**; account-like functions are embedded in the homepage wallet section.

## 5. Newly created pages

- Current uncommitted state is clean: `git status --short` returned no output and `git diff --stat` returned no output.
- No page route file was newly created after the initial commit.
- All 9 page route templates were added in initial commit `638f7ea`.
- New UI-adjacent files added later include:
  - `src/components/MaintenanceBanner.tsx` added in `3c4b98f` and also recorded later in `a1581a4`.
  - `src/app/icon.svg` added in `960bdae`.
- New API routes added after the initial commit include:
  - `src/app/api/admin/audit/route.ts`
  - `src/app/api/admin/reports/reconciliation/route.ts`
  - `src/app/api/admin/reports/tiers/route.ts`
  - `src/app/api/admin/tiers/route.ts`
  - `src/app/api/admin/tiers/[id]/route.ts`
  - `src/app/api/rounds/state/route.ts`
  - `src/app/api/tiers/route.ts`
  - `src/app/api/admin/rounds/[id]/review/route.ts`
  - `src/app/api/admin/rounds/[id]/settle/route.ts`
  - `src/app/api/admin/rounds/open/route.ts`
  - `src/app/api/admin/treasury/initialize/route.ts`

## 6. Modified pages

Distinct page templates modified after initial creation:

- `src/app/[locale]/page.tsx`
  - Modified in `2fed422`, `6ca881e`, `2f107ca`, `3c4b98f`, `a1581a4`.
- `src/app/admin/page.tsx`
  - Modified in `5ecf107`, `2f107ca`, `5ed342a`, `a1581a4`, `c0fccc4`.
- `src/app/[locale]/verify/page.tsx`
  - Modified in `2f107ca`.
- `src/app/[locale]/verify/[round]/page.tsx`
  - Modified in `2f107ca`.
- Other localized page templates were created in `638f7ea` and not modified in the inspected page-level history.

Notable Git finding:

- Commit `accf1124d623c4c08cf76026ee84b2e3a8e1a8ef` is titled `Add website favicon and PWA icons`, but `git show --name-status` reports only:
  - `M .env.test.example`
  - `M public/sw.js`
- This is a commit-message/content mismatch worth reviewing, though commit provenance itself is intact.

## 7. Complete route inventory

### Page routes

| Route | File | Type | Status | Notes |
|---|---|---|---|---|
| `/` | `src/proxy.ts:33-36` | Rewrite | VERIFIED | No root `page.tsx`; renders `/{locale}` directly as 200. |
| `/[locale]` | `src/app/[locale]/page.tsx:30-73` | Public/user | VERIFIED | Locale guard `L32`, dictionary `L34`, `I18nProvider` `L42`, full homepage shell `L52-L69`. |
| `/[locale]/install` | `src/app/[locale]/install/page.tsx:17-25` | Public/user | VERIFIED | Locale guard `L19`, `InstallGuide` `L22`, `ServiceWorkerRegistration` `L23`. |
| `/[locale]/verify` | `src/app/[locale]/verify/page.tsx:20-35` | Public/user | VERIFIED | Dynamic; loads history with `requireDrawHistory(30)` `L26`. |
| `/[locale]/verify/[round]` | `src/app/[locale]/verify/[round]\page.tsx:11-83` | Public/user | PARTIALLY VERIFIED | DB verification works in code, but hardcoded English/LTR. |
| `/[locale]/terms` | `src/app/[locale]/terms/page.tsx:20-24` | Legal/public | VERIFIED | Uses `LegalPage` with English binding document. |
| `/[locale]/privacy` | `src/app/[locale]/privacy/page.tsx:20-24` | Legal/public | VERIFIED | Uses `LegalPage` with English binding document. |
| `/[locale]/responsible-gaming` | `src/app/[locale]/responsible-gaming/page.tsx:20-24` | Legal/public | VERIFIED | Uses `LegalPage` with English binding document. |
| `/[locale]/restricted` | `src/app/[locale]/restricted/page.tsx:12-44` | Geo/public | VERIFIED | Reachable from blocked regions; canonical is hardcoded `/en/restricted` at `L10`. |
| `/admin` | `src/app/admin/page.tsx` | Admin | PARTIALLY VERIFIED | Multiple API-backed panels; several admin workflows are API-only. |

### Special route files

| File | Status | Notes |
|---|---|---|
| `src/app/layout.tsx` | VERIFIED | Sets `lang`/`dir` from proxy locale at `L40-L45`; metadata at `L11-L27`. |
| `src/app/not-found.tsx` | PARTIALLY VERIFIED | English/Persian only at `L8`. |
| `src/app/[locale]/error.tsx` | PARTIALLY VERIFIED | English/Persian only at `L13-L17`. |
| `src/app/sitemap.ts` | VERIFIED | Indexes 6 paths × 6 locales at `L8-L24`; excludes restricted and verify detail. |
| `src/app/robots.ts` | VERIFIED | Disallows `/api/`, `/admin`, and `/*?ref=` at `L7-L9`. |
| `src/app/manifest.ts` | PARTIALLY VERIFIED | PWA manifest hardcoded English/LTR at `L10-L19` and shortcuts `L27-L29`. |
| `src/app/icon.svg` | VERIFIED | Icon asset exists. |
| `src/app/globals.css` | VERIFIED | Global styling file exists. |
| Loading routes | NOT VERIFIED | No `loading.tsx` files found; fallback states are component-level. |

### API route inventory

- Public/state APIs:
  - `/api/state`
  - `/api/health`
  - `/api/tiers`
  - `/api/rounds/state`
  - `/api/rounds/history`
  - `/api/vault/onchain`
  - `/api/vault/candles`
  - `/api/cron`
- Auth/account/wallet APIs:
  - `/api/auth/connect`
  - `/api/auth/logout`
  - `/api/auth/telegram`
  - `/api/auth/telegram-link`
  - `/api/account`
  - `/api/wallet/nonce`
  - `/api/wallet/verify`
  - `/api/wallet/info`
  - `/api/wallet/deposit`
  - `/api/wallet/claim`
  - `/api/telegram/webhook`
  - `/api/telegram/setup`
- Ticket/game/payment APIs:
  - `/api/tickets/buy`
  - `/api/wheel/spin`
  - `/api/payments/deposit`
  - `/api/payments/ipn`
  - `/api/payments/withdraw`
- Admin APIs:
  - `/api/admin/automation`
  - `/api/admin/audit`
  - `/api/admin/fees`
  - `/api/admin/reports/reconciliation`
  - `/api/admin/reports/tiers`
  - `/api/admin/rounds/open`
  - `/api/admin/rounds/[id]/review`
  - `/api/admin/rounds/[id]/settle`
  - `/api/admin/tiers`
  - `/api/admin/tiers/[id]`
  - `/api/admin/treasury/initialize`
  - `/api/admin/withdrawals`
  - `/api/admin/withdrawals/pay`

Total API route files found: **38**.

## 8. Navigation and link audit

Static link verification:

- Locale-aware helper: `href(path)` maps to `/{locale}{path}` at `src/i18n/client.tsx:43`.
- Header navigation array: `src/components/Header.tsx:35-42`
  - `#pool`
  - `#wheel`
  - `#wallet`
  - `#invite`
  - `#faq`
  - `/{locale}/install`
- Header nav rendered at `src/components/Header.tsx:115-121`.
- Header logo links to `#top` at `src/components/Header.tsx:110`; target exists in `src/components/Hero.tsx:36`.
- Hero CTAs:
  - `#wheel` at `src/components/Hero.tsx:83`
  - `#pool` at `src/components/Hero.tsx:86`
- Footer product links:
  - `#pool`, `#wheel`, `#prizes`, `#invite`, `#faq` at `src/components/Sections.tsx:435-439`.
- Footer legal links:
  - `/verify`, `/install`, `/terms`, `/privacy`, `/responsible-gaming` at `src/components/Sections.tsx:445-449`.
- Install CTA uses `href("/install")` at `src/components/Sections.tsx:403-410`.
- Wallet modal legal links:
  - `/terms`, `/privacy` at `src/components/Header.tsx:238-239`.
- Compliance links:
  - `/responsible-gaming`, `/terms`, `/privacy` at `src/components/Compliance.tsx:78`, `:103-104`, `:125`.
- Verification links:
  - `src/components/Sections.tsx:256`
  - `src/components/WinnersHistory.tsx:224`
  - `src/components/Toasts.tsx:153`
  - `src/components/VerifyExplorer.tsx:82`
- Legal page internal links:
  - home, terms, privacy, responsible gaming at `src/components/LegalPage.tsx:13-16`, `:45-47`.

Findings:

- No statically broken internal href target was identified.
- Runtime navigation was not tested.
- Primary header navigation is hidden below `xl` via `hidden ... xl:flex` at `src/components/Header.tsx:115`; no hamburger/mobile replacement was identified in the inspected header. Footer links remain available on small screens.

## 9. Feature implementation status

“Operational” below means code-wired to backend/API/DB/chain paths; it is not runtime-verified.

| Feature | Status | Evidence / notes |
|---|---|---|
| Homepage/hero | Operational live; demo local | `Hero.tsx:22-30`, `AppProvider.tsx:94-121`, `/api/state`. |
| Vault/treasury | Operational reads | `/api/vault/onchain`, `/api/vault/candles`; chart hidden unless ledger verified. |
| Wallet connection | Operational live; demo local | Injected Solana providers only; nonce/sign/verify flow in `WalletConnect.tsx:183-220`. |
| Deposit/withdraw | Backend implemented; UI disabled | `paymentsEnabled=false` at `config.ts:125`; buttons disabled in `DepositCard.tsx`, `Wallet.tsx`. |
| Ticket purchase | Operational backend; disabled by maintenance; demo local | `/api/tickets/buy`; maintenance gate in `api/tickets/buy/route.ts:13-15`. |
| Draw/results | Verification operational; reveal demo-only | Verification page recomputes hash/HMAC; buy API returns `draw: null`. |
| Admin review/settlement | Incomplete UI | APIs exist, no matching UI calls found in `admin/page.tsx`. |
| Pool/tier system | Operational | `/api/tiers`, `/api/rounds/state`, admin tier management. |
| Referral | Operational live; demo local | Backend awards bonus spins and first-deposit bonus at `store.ts:721-739`, `:1544-1564`; UI stats static. |
| Leaderboard/winners | Operational live; demo local | DB-backed `/api/state` and `/api/rounds/history`. |
| Account/dashboard | Embedded operational; incomplete standalone | No `/account`; wallet section holds account controls. |
| Admin dashboard | Partially operational | Many API-backed panels; round/treasury/reconciliation workflows incomplete. |
| Financial reports | Data operational; transfers disabled | `/api/admin/fees`, `/api/admin/reports/tiers`; transfer UI says paused. |
| Audit log/reconciliation | Audit operational; reconciliation API-only | `/api/admin/audit`; no UI call to `/api/admin/reports/reconciliation`. |
| Maintenance banner | Operational flag; English-only | `MaintenanceBanner.tsx:9-13`. |
| FAQ/informational | Static/informational | Dictionary/static sections; compliance term acceptance uses `/api/account`. |

## 10. Localization results

Supported locales are `en`, `es`, `fa`, `ar`, `tr`, `ru` at `src/i18n/config.ts:1`; RTL locales are `fa` and `ar` at `src/i18n/config.ts:6` and `:30`. Root layout sets locale/direction from proxy headers at `src/app/layout.tsx:40-45`.

Confirmed localization failures:

- `/[locale]/verify/[round]`:
  - No `getDictionary`/`I18nProvider`.
  - Hardcoded English at `src/app/[locale]/verify/[round]\page.tsx:18`, `:23-24`, `:45-60`, `:71-72`.
  - Forced `dir="ltr" lang="en"` at `L67`, including for `fa` and `ar`.
  - Code block forced LTR at `L74`.
- `src/app/not-found.tsx:8`: English/Persian only.
- `src/app/[locale]/error.tsx:13-17`: English/Persian only.
- `src/components/MaintenanceBanner.tsx:9-13`: English-only text on localized homepage at `src/app/[locale]/page.tsx:50`.
- Legal pages:
  - `src/components/LegalPage.tsx:21-25` shows only a notice for non-English locales.
  - Body forced `dir="ltr" lang="en"` at `L27`.
  - `src/i18n/legal.ts:1-4` explicitly states English is binding and the documents are templates.
- `src/app/[locale]/restricted/page.tsx:10`: canonical hardcoded as `/en/restricted` for every locale.
- `src/app/admin/page.tsx:121`: admin forced LTR/en.
- `src/components/Hero.tsx:63`: hardcoded English badge text.
- PWA manifest is hardcoded English/LTR at `src/app/manifest.ts:10-19` and `:27-29`.

## 11. Responsive design findings

Static-code-only; no browser viewport testing was performed.

- The site uses responsive utility classes throughout:
  - Header layout uses `flex`, `sm:gap`, and hidden breakpoints at `src/components/Header.tsx:108-115`.
  - Section grids use responsive classes such as `lg:grid-cols-2` at `src/components/Sections.tsx:212`.
  - Footer stacks on small screens and splits on larger screens at `src/components/Sections.tsx:395`, `:474`.
- Primary header nav is hidden below `xl` at `src/components/Header.tsx:115`; no small-screen menu replacement was identified in the inspected header.
- RTL locales are supported globally by `dirOf()` at `src/i18n/config.ts:30` and `src/app/layout.tsx:45`, but forced LTR pages break RTL consistency.
- No route-level `loading.tsx` files were found; components implement their own empty/unavailable states.
- Visual overflow, touch targets, modal behavior, and real viewport behavior remain **NOT VERIFIED**.

## 12. Broken and incomplete functionality

- Admin round lifecycle APIs exist at:
  - `src/app/api/admin/rounds/[id]/review/route.ts:8-22`
  - `src/app/api/admin/rounds/[id]/settle/route.ts:8-19`
  - `src/app/api/admin/rounds/open/route.ts:8-23`
  - `src/app/api/admin/treasury/initialize/route.ts:8-12`
  - No matching UI calls were found in `src/app/admin/page.tsx`.
- Reconciliation API exists at `src/app/api/admin/reports/reconciliation/route.ts:8-15`; no UI call found.
- `WinnersHistory` fetches `feeStatus`, `feeTxHash`, and `serverSeed` at `src/components/WinnersHistory.tsx:9-23`, but rendered columns omit these at `:189-229`.
- Admin audit entries fetch `details` at `src/app/admin/page.tsx:902-910` but do not render it at `:937-941`.
- Demo deposit helper exists at `src/lib/demoSession.ts:420-446`, but the visible demo deposit card has no deposit control at `src/components/DepositCard.tsx:37-48`.
- Maintenance copy says actions “may be paused” at `MaintenanceBanner.tsx:10-12`, while UI hard-disables purchases/spins/withdrawals when maintenance is on.
- Public footer says “PURE LUCK. ZERO DELAYS.” at `src/components/Sections.tsx:481`, conflicting with provisional/admin-review copy.
- Hero shows unconditional “ONLINE” while values can be unavailable or `—` at `src/components/Hero.tsx:119-131`.
- Ticket confirmation uses `state.config.ticketPrice` rather than the selected tier price at `src/components/PoolBand.tsx:383-404`.
- FAQ/how-it-works claims wheel prizes `$0.10-$5.00`, while wheel UI values max at `$1.00`.
- Header demo form keeps `telegram` in state and sends it at `src/components/Header.tsx:29`, `:101`, but renders only username/referral inputs at `:265-275`.
- Account history is limited to 5 recent deposits/withdrawals and 50 tickets in `src/lib/store.ts:1834-1845`; no pagination UI found.
- `account()` has no demo branch for `accept_terms` in `src/components/AppProvider.tsx:252-272`, while compliance can call that action.

## 13. Financial feature availability and restrictions

- `publicConfig().paymentsEnabled` is hardcoded `false` at `src/lib/config.ts:125`.
- Maintenance defaults ON when unset at `src/lib/config.ts:87-90` and `src/lib/gameConfig.ts:43-53`.
- Deposit UI is disabled unless `paymentsEnabled && solana.enabled && !maintenance` at `src/components/DepositCard.tsx:29-31`.
- Withdraw button is disabled during maintenance at `src/components/Wallet.tsx:137-143`.
- Auto-sweep is hardcoded disabled at `src/lib/config.ts:91-94`.
- Automatic payouts are hardcoded disabled at `src/lib/payout.ts:11`.
- Fee transfer API returns that transfers are paused at `src/app/api/admin/fees/route.ts:49-50`.
- Manual payout UI exists in admin via `/api/admin/withdrawals/pay`, but prior Phase 8 audit found unresolved solvency/ledger gating issues.
- Demo withdrawal is localStorage-only at `src/components/AppProvider.tsx:403-413`.
- No financial, blockchain, payment, deposit, withdrawal, or ledger action was executed during this website audit.
- Production financial readiness remains **FAILED**.

## 14. Priority list of improvements

**P0**

- Do not treat this build as production-ready.
- Fix prior critical financial-control findings: maintenance public-env override, broadcast fail-open, invalid transaction-parsing method, manual payout without solvency/ledger gate, confirmed-vs-finalized deposit issue, stuck deposit credit state, schema/config drift, and hardcoded readiness blocker.
- Wire admin round review/settle/open, treasury initialize, and reconciliation into the admin UI, or remove public claims that depend on those workflows.
- Localize and RTL-correct `/[locale]/verify/[round]`, 404, error, and maintenance banner.

**P1**

- Correct disabled payment/withdrawal copy so UI messages match actual gating.
- Fix selected-tier price mismatch in ticket purchase confirmation.
- Render fetched fee/on-chain transparency fields in `WinnersHistory`, or stop fetching them.
- Add mobile navigation for header links hidden below `xl`.
- Fix conflicting public copy: “zero delays,” wheel prize ranges, hardcoded economy copy, and demo/guest spin claims.
- Add real pagination or clearly label truncated account history.

**P2**

- Localize the PWA manifest and hardcoded app copy.
- Fix `/[locale]/restricted` canonical URL per locale.
- Replace English-only legal documents with reviewed localized versions while preserving English-binding language.
- Add route-level loading states or document component-level fallback behavior.
- Review commit `accf112` message/content mismatch.

| Area | Status | Main findings | Priority |
|---|---|---|---|
| Route inventory | VERIFIED | 9 page templates, 38 API routes, `/` handled by proxy rewrite | Low |
| Page counts | VERIFIED | 8 public/user, 1 admin, 48 localized public URLs | Low |
| New/modified pages | VERIFIED | Clean tree; all page files created in initial commit; 4 page templates modified later | Low |
| Navigation links | VERIFIED | Static internal links resolve; mobile nav gap found | Medium |
| Feature implementation | PARTIALLY VERIFIED | Source-level wiring confirmed; runtime not tested | Medium |
| Admin workflows | FAILED | Round/treasury/reconciliation APIs lack UI | High |
| Localization | FAILED | Several localized routes hardcoded English/LTR; RTL broken | High |
| Responsive design | NOT VERIFIED | Static responsive classes present; no visual testing; mobile nav gap | Medium |
| Broken/incomplete functionality | VERIFIED | Multiple UI/API gaps and copy/data inconsistencies | High |
| Financial availability | VERIFIED | Payments, transfers, payouts, auto-sweep disabled or gated | High |
| Financial production readiness | FAILED | Prior unresolved critical control issues remain | Critical |
| Git UI/page history | VERIFIED | Clean tree; relevant UI commits identified; one message/content mismatch | Low |
