# BETX Phase 9A Independent Audit — Terminal Report

**Mode:** strict read-only audit; no source files were created, modified, deleted, restored, committed, pushed, built, migrated, or deployed during the audit. This report file was created only after explicit user authorization.  
**Repository:** `F:\betx-lottery-main`  
**Audit date:** 2026-11-26  
**Git state:** `main` at `2178d6af148df771a24e2bcd4902b7b56dcddfe6`; `origin/main` identical.  
**Worktree:** 18 tracked files modified, 0 staged, 2 untracked reports preserved. Final status matched the starting status.  
**Overall:** **FAIL — Phase 9A NOT APPROVED.**

## 1. Modified file inventory

| File | Purpose / evidence | Status |
|---|---|---|
| `src/app/[locale]/page.tsx:50` | Passes localized `dict.ui.maintenanceBanner` to `MaintenanceBanner`. | PASS |
| `src/components/DepositCard.tsx:26,40,79` | Uses `t`, removes stray `آ·`, localizes min-deposit placeholder. | PASS |
| `src/components/Header.tsx:55-56,90-97,136-147,152,226-245` | Adds conditional vault status, Escape-close handler, accessible mobile menu button/panel, localized vault label. | PASS |
| `src/components/Hero.tsx:22-45,75,110-182` | Adds state/data/loading/maintenance/demo status logic, localized badge, stats, empty values, and active-tier prize fallback. | PASS |
| `src/components/MaintenanceBanner.tsx:1,9` | Accepts and renders localized `message`. | PASS |
| `src/components/OnchainTreasury.tsx:59,87,91` | Localizes demo label and no-data fallbacks. | PASS |
| `src/components/PoolBand.tsx:29,82,96,179,183,329-332,390` | Uses selected-tier price/cost, localized round/sold/fair-hash labels, maintenance-aware badge. | PASS |
| `src/components/Sections.tsx:70,339,342,365-366,458,481` | Localizes winner/ticket/FAQ/footer labels and no-data fallback. | PASS |
| `src/components/Toasts.tsx:140,144,150` | Moves prize/fee/OK labels into dictionary keys. | WARNING |
| `src/components/Wallet.tsx:133,311` | Localizes address placeholder and self-exclusion label. | PASS |
| `src/components/Wheel.tsx:299` | Moves wheel kicker into dictionary key. | WARNING |
| `src/i18n/dictionaries/ar.ts:12,256,267` | Adds `ui`; updates wheel range. | PASS |
| `src/i18n/dictionaries/en.ts:21,153,265,276,379` | Adds canonical `ui`; updates wheel range. | PASS |
| `src/i18n/dictionaries/es.ts:23,267,278` | Adds `ui`; updates wheel range. | PASS |
| `src/i18n/dictionaries/fa.ts:29,273` | Adds `ui`; updates prize row. | PASS |
| `src/i18n/dictionaries/ru.ts:23,267,278` | Adds `ui`; updates wheel range. | PASS |
| `src/i18n/dictionaries/tr.ts:23,267` | Adds `ui`; updates prize row only. | **FAIL** |
| `tests/phase7-ui.test.mjs:56-85` | Adds shared-copy, wheel-copy, banner/status, and mobile-nav source checks. | **FAIL** |

## 2. Findings

### FAIL — critical: Turkish wheel prize copy is still wrong

`WHEEL_SECTORS` ranges from `$0.05` to `$1.00` (`src/lib/wheel.ts:2-13`). English, Arabic, Spanish, Persian, and Russian wheel copy was corrected, but Turkish still advertises the old range in three user-visible places:

- `src/i18n/dictionaries/tr.ts:155` — wheel body: `0,10$ ile 5,00$`
- `src/i18n/dictionaries/tr.ts:278` — “How it works” step: `0,10$ ile 5,00$`
- `src/i18n/dictionaries/tr.ts:381` — FAQ: `0,10$ ile 5,00$`

This directly contradicts `PHASE-9A-EXECUTION-REPORT.md:30`, which claims the range was corrected across all dictionaries. It is misleading public prize information and is blocking.

### FAIL — critical: the new wheel-copy test gives a false pass

`tests/phase7-ui.test.mjs:65-70` claims to verify wheel copy against sectors, but its regexes only match `$0.10` / `$5.00`:

- `tests/phase7-ui.test.mjs:67` checks `/\$0\.10|\$5\.00/`
- `tests/phase7-ui.test.mjs:69` checks `/\$0\.10|\$5(?:\.00)?\b/`

Turkish uses suffix/comma formatting (`0,10$`, `5,00$`), so the stale strings pass. Current test run reports the wheel-copy test as passing despite the critical defect. This is a false-positive regression guard.

### WARNING — minor: dictionary-backed strings are still English in every locale

Several labels were moved into dictionaries but not translated:

- `d.pool.prize = "PRIZE"` in all six dictionaries (`en.ts:103`, `fa.ts:111`, `es.ts:105`, `ar.ts:94`, `ru.ts:105`, `tr.ts:105`), rendered at `Toasts.tsx:140` and `PoolBand.tsx:197`.
- `d.wheel.kicker = "DAILY LUCKY WHEEL · FREE"` in all six dictionaries (`en.ts:150`, `fa.ts:158`, `es.ts:152`, `ar.ts:141`, `ru.ts:152`, `tr.ts:152`), rendered at `Wheel.tsx:299`.
- `d.footer.vault = "VAULT"` in all six dictionaries (`en.ts:392`, `fa.ts:400`, `es.ts:394`, `ar.ts:383`, `ru.ts:394`, `tr.ts:394`), rendered at `Header.tsx:152` and `Sections.tsx:456`.

The components no longer contain hardcoded English, but the user-visible strings remain English.

### WARNING — minor: mobile navigation keyboard/focus behavior is partial

Core accessibility wiring is present: `aria-controls`, `aria-expanded`, localized labels, `dir`, Escape close, and links close the menu (`Header.tsx:136-147`, `Header.tsx:90-97`, `Header.tsx:226-245`). No focus return, focus trap, or outside-click close was found. This needs runtime/browser verification.

### WARNING — minor: default whitespace check fails due CRLF

`git diff --check` reports trailing whitespace at `src/app/[locale]/page.tsx:50`. `git ls-files --eol` shows that file as CRLF in both index and worktree, and no `.gitattributes` exists. `git -c core.whitespace=cr-at-eol diff --check` passes. This is not a functional defect, but the default check fails.

### WARNING — minor: execution report verification count is stale

`PHASE-9A-EXECUTION-REPORT.md:64` says phase-7 UI tests had “4 pass”; current `tests/phase7-ui.test.mjs` contains 7 tests and current run is 7 pass, 0 fail.

### NOT VERIFIED: visual/RTL/browser behavior

No browser tool is available in this session. Responsive and RTL rendering were not visually verified.

### NOT VERIFIED: production build in this audit

`npm run build` was not run because it would write `.next` and regenerate `public/sw.js`, violating read-only audit constraints. The prior execution report claims it passed.

## 3. Missing tests

- Locale-content assertions covering Turkish decimal/suffix currency formats (`0,10$`, `5,00$`, `0.10$`, `5$`).
- Assertion that every wheel-related public string stays within the actual sector range, not just selected source fields.
- Runtime/component tests for status precedence: unavailable → loading → maintenance → demo → online.
- Runtime tests for localized maintenance banner rendering.
- Runtime mobile-nav tests: open/close, Escape, link-click close, `hidden`, `aria-expanded`, and focus return.
- RTL/browser layout checks for `fa` and `ar`.
- Tests detecting untranslated dictionary values such as `PRIZE`, `VAULT`, and `DAILY LUCKY WHEEL · FREE`.

## 4. Verification performed

- `npm run typecheck` — **PASS**
- `npm run lint` — **PASS**
- `node --experimental-strip-types --test tests/phase7-ui.test.mjs` — **PASS**, 7/7, but false-positive on wheel copy.
- `npm test` — **PASS**, 38 tests: 36 pass, 0 fail, 2 skipped.
- Protected-path diff — **PASS**, no changes to Solana/store/payout/tier/treasury accounting, wallet/admin-withdrawal APIs, `src/db/**`, or `supabase/migrations/**`.
- `public/sw.js` diff — **PASS**, no changes.
- Financial gates — **PASS** by inspection: `paymentsEnabled=false` (`src/lib/config.ts:46-48,125`), `autoSweep=false` (`src/lib/config.ts:92-94`), maintenance defaults on (`src/lib/config.ts:87-90`).

## 5. Decisions

- **Phase 9A approval:** **NOT APPROVED.**
- **Phase 9B:** **DO NOT START.**
- **Reason:** Critical Turkish prize-copy defect plus a false-positive regression test that masks it.
- **Required before reconsideration:** correct all Turkish wheel-copy surfaces, strengthen the wheel-copy test for locale formats, re-run verification, and re-audit.
- **No fixes were applied during this audit.**
