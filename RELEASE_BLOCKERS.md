# BETX — Release Blockers & Go-Live Checklist

This document lists what still needs to happen **before** the app is safe to run with
real money. It is the authoritative "what's left" list for production launch on
**Solana Mainnet-Beta + USDC (SPL)**.

---

## 1. Owner input required (cannot be filled by code)

These are legal/business facts that only the operator can supply. Until they are
filled in, the legal pages show the pre-launch status note and the footer uses
generic text.

| Item | Env var | Notes |
|---|---|---|
| Legal company / entity name | `COMPANY_NAME` | Shown in footer. |
| License / registration number | `LICENSE_INFO` | Shown in footer when set. Use the real gambling license (Curaçao / Anjouan etc.) or correct local registration. |
| Support email | `SUPPORT_EMAIL` | Default `support.betx@gmail.com` is a placeholder — replace with an official domain mailbox. |
| Responsible-gambling help link | `GAMBLING_HELP_URL` | Default `https://www.begambleaware.org`; localise if required. |
| Terms / Privacy / RG legal copy | — | `src/i18n/legal` templates must be reviewed by a lawyer for the operating jurisdiction. |
| Target jurisdictions & blocked-country list | — | Confirm geo-block policy and that restricted users cannot deposit. |

> Real-money lotteries/betting require a gambling licence in most jurisdictions
> and are criminal to operate in some (e.g. Iran). Do **not** disable maintenance
> mode until legal counsel confirms the business is licensed to operate.

---

## 2. Required environment variables (production)

```env
# --- core ---
BETX_MODE=live
APP_URL=https://<your-domain>
DATABASE_URL=postgres://...            # required at build AND runtime
ADMIN_TOKEN=<long-random-string>
VAULT_INITIAL=<funded treasury float>   # vault must be initialised explicitly

# --- Solana mainnet-beta / USDC (SPL) ---
SOLANA_CLUSTER=mainnet-beta
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com   # or a paid RPC
SOLANA_TREASURY_ADDRESS=<mainnet treasury pubkey>
NEXT_PUBLIC_SOLANA_TREASURY_ADDRESS=<same pubkey>
SOLANA_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# --- maintenance switch ---
# Default when unset is TRUE (maintenance ON). Set BOTH to "false" to go live.
MAINTENANCE_MODE=false
NEXT_PUBLIC_MAINTENANCE_MODE=false

# --- payments (optional; enable only when configured) ---
NOWPAYMENTS_API_KEY=<key>              # pay currency defaults to "usdcsol"
NOWPAYMENTS_IPN_SECRET=<secret>
NOWPAYMENTS_PAY_CURRENCY=usdcsol

# --- telegram (optional) ---
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_BOT_USERNAME=<username>
TELEGRAM_WEBHOOK_SECRET=<secret>
TELEGRAM_ADMIN_CHAT_ID=<chat id>

# --- legal / display ---
COMPANY_NAME=<legal entity>
LICENSE_INFO=<licence number>
SUPPORT_EMAIL=<official email>
GAMBLING_HELP_URL=https://www.begambleaware.org
```

---

## 3. Maintenance-mode switch (implemented)

- `src/lib/gameConfig.ts` → `isMaintenanceMode()` reads
  `NEXT_PUBLIC_MAINTENANCE_MODE` / `MAINTENANCE_MODE`; **unset = ON**.
- `config.maintenanceMode` and `publicConfig().maintenance` expose the flag.
- The homepage renders `<MaintenanceBanner enabled={publicConfig().maintenance} />`
  (`src/components/MaintenanceBanner.tsx`).
- Server-side guards return `503 { ok:false, error:"maintenance" }` on:
  `POST /api/payments/deposit`, `POST /api/payments/withdraw`,
  `POST /api/tickets/buy`, `POST /api/wheel/spin`, `POST /api/wallet/deposit`,
  `POST /api/wallet/claim`.
- Client actions are disabled while maintenance is on: deposit pay/claim,
  withdraw submit, wheel spins, and pool ticket purchases.

**To go live:** confirm treasury is funded, set both maintenance env vars to
`false`, and redeploy.


---

## 4. Known remaining references (INERT in live mode — recommend follow-up cleanup)

The public, user-facing surface now shows **USDC (SPL) on Solana**. The following
internal/legacy references remain but are **not reachable when `BETX_MODE=live`**
(the default). They should be removed in a dedicated cleanup PR:

- **Legacy Tron packages still in `package.json`**: `tronweb` and the
  `@tronweb3/tronwallet-adapter-*` family. Unused by the Solana code paths.
- **`src/lib/demoSession.ts`**: browser-local demo preview. Only used when
  `config.live === false`.
- **Dictionary demo/sandbox keys** in `src/i18n/dictionaries/*.ts`
  (`wc.demoBadge`, `wc.bodyDemo`, `wc.hintDemo`, `wallet.demo*`,
  `vaultChart.kickerDemo`/`subtitleDemo`/`demoHistoryUnavailable`,
  `onchain.demoNote`, `footer.demo`). Only rendered in demo mode.
- **`src/app/admin/page.tsx`**: reads a legacy `tron` field from the admin status
  payload; internal admin tool only.
- **`DEPLOY.md`**: legacy Tron/TRC-20/NOWPayments sections are marked
  "disabled/legacy" but still contain old instructions.
- Verify the Solana wallet menu shows only Solana providers.

None of the above affects live money flows, but they violate the "no Tron/USDT
references" goal and should be cleaned up before marketing/audit.

---

## 5. Database & API robustness

- `src/db/index.ts` **throws at import when `DATABASE_URL` is missing**, which
  fails `next build` during page-data collection. Set `DATABASE_URL` in the build
  environment (or provide a dummy for CI type-check builds).
- Apply the versioned migration to an isolated test database first, then
  production. Do **not** run `supabase/schema.sql` blindly on an existing DB.
- API routes that read the DB (`/api/state`, `/api/vault/onchain`,
  `/api/vault/candles`, `/api/rounds/history`) return non-`ok` JSON on failure and
  the client shows explicit "unavailable" states instead of an endless `—`.
- `scripts/build-sw.cjs` runs after `next build`; a successful build ends with
  `service worker written …`.

---

## 6. Pre-launch verification

1. `npx tsc --noEmit` → must pass (currently passes).
2. `DATABASE_URL=... npm run build` → must pass (verified with a placeholder URL).
3. Fund the Solana treasury and confirm `/api/vault/onchain` reads the USDC balance.
4. Set maintenance env vars to `false`, redeploy, and run one **small** deposit →
   ticket → settle → withdraw cycle end-to-end with real money before announcing.
5. Confirm the legal pages and footer show the real entity and support email
   from step 1.
