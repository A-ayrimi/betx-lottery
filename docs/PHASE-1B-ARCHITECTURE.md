# BETX Phase 1B — معماری فنی و طرح پیادهسازی ایمن

تاریخ: 2026-11-26  
سند مبنا: `docs/PHASE-1A-SPEC.md` — **APPROVED / LOCKED**  
مرجع مخزن: `F:\betx-lottery-main` — branch `main` — HEAD `2178d6af148df771a24e2bcd4902b7b56dcddfe6`  
Snapshot مقایسهای: `F:\betx-lottery-main1\betx-lottery-main` — بدون `.git`  
وضعیت: **ARCHITECTURE APPROVED FOR PLANNING — Phase 2 هنوز مجاز نیست**  
حالت اجرا: **DOCUMENTATION ONLY — فقط مستندسازی؛ بدون تغییر کد، دیتابیس، migration یا ادغام MAIN و WORKSPACE**

---

## 1. دامنه، تضمینها و ممنوعیتها

1.1. این سند صرفاً طراحی معماری Phase 1B است و بر اساس تصمیمات قفلشده Phase 1A نوشته شده است.

1.2. تضمینهای اجرای این مرحله:

| مورد | وضعیت |
|---|---|
| تغییر فایل کد `.ts` / `.tsx` / `.mjs` / `.json` | **انجام نشد** |
| تغییر `src/db/schema.ts` یا فایلهای `supabase/**` | **انجام نشد** |
| اجرای migration یا اتصال به دیتابیس / RPC / کیف پول | **انجام نشد** |
| ادغام، کپی یا بازنویسی WORKSPACE در MAIN | **انجام نشد** |
| عملیات Git نوشتاری (`add` / `commit` / `merge` / `checkout` / `push` / `stash`) | **انجام نشد** |
| تنها خروجی | دو فایل مستند در `F:\betx-lottery-main\docs\` |

1.3. کلیهٔ طراحیهای زیر **پیشنهاد معماری برای Phase 2** هستند و تا تکمیل چکلیست بند 8، نباید پیادهسازی شوند.

---

## 2. انتخاب مرجع نهایی و روش ایمن یکپارچهسازی

### 2.1. تصمیم مرجع

| نقش | مسیر | تصمیم |
|---|---|---|
| **مرجع نهایی (Canonical Base)** | `F:\betx-lottery-main` @ `2178d6af148df771a24e2bcd4902b7b56dcddfe6` | **انتخاب شد** |
| **Snapshot اهداکننده (Feature Donor)** | `F:\betx-lottery-main1\betx-lottery-main` | **صرفاً منبع ماژولهای مرجعی، نه جایگزین مرجع** |

دلیل انتخاب MAIN:

- تنها طرفی است که دارای تاریخچهٔ Git و HEAD قابلرجاع است.
- دارای بنیاد multi-tier شامل `ticket_tiers`، `draw_commitments`، `round_settlements`، `treasury_transactions` و migration مربوطه است.
- دارای کانترکتهای تست و report/admin مربوط به Phase 6/7/9A/9B است.
- WORKSPACE فاقد `.git` است و نمیتواند مبنای ممیزی تغییرات قرار گیرد.

### 2.2. اصل کلی: «ادغام دستی بر مبنای مرجع، بدون overwrite»

- MAIN نباید توسط WORKSPACE بازنویسی شود.
- WORKSPACE نباید حذف یا با MAIN جایگزین شود.
- هیچ `git merge`، `cp -r` یا کپی کامل سطح فایل مجاز نیست.
-هر module از WORKSPACE باید بهعنوان یک «واحد بررسیشده» با diff، تست و تأیید مالک به داخل شاخهٔ integration منتقل شود.

### 2.3. فهرست ماژولهای منحصر به WORKSPACE که باید بهعنوان donor بررسی شوند

| ماژول WORKSPACE | وضعیت در MAIN | اقدام پیشنهادی در Phase 2 |
|---|---|---|
| `src/app/api/account/age/route.ts` | وجود ندارد | طراحی مجدد بهعنوان Age Verification سرورساز مطابق Phase 1A |
| `src/lib/referralSafety.ts` | وجود ندارد | مبنای طراحی Referral ایمن با idempotency و KYC gate |
| `src/lib/solanaVerification.ts` | وجود ندارد | مبنای تأیید تراکنش Solana، با جایگزینی RPCهای غیراستاندارد |
| `src/lib/depositProviders.ts` | وجود ندارد | بررسی و طراحی مجدد با سقف $500 و KYC |
| `src/lib/randomness.ts` | وجود ندارد | فقط بهعنوان مرجع؛ طراحی نهایی بند 5.4 جایگزین میشود |
| `scripts/reconcile-legacy-deposits.mjs` | وجود ندارد | تبدیل به ابزار قرنطینه و طبقهبندی legacy با خروجی قابل ممیزی |
| `supabase/migrations/20261124_age_verification.sql` | وجود ندارد | الهامبرگیری، نه اجرای مستقیم؛ باید با طراحی KYC بند 4 هماهنگ شود |
| `tests/referral-safety.test.mjs`، `tests/solana-deposits.test.mjs` | وجود ندارد | بهعنوان کانترکت تست donor حفظ شوند |

### 2.4. ماژولهای منحصر به MAIN که نباید حذف شوند

| ماژول | دلیل حفظ |
|---|---|
| `/api/admin/reports/reconciliation`، `/api/admin/reports/tiers` | لایهٔ reports و reconciliations |
| `/api/tiers`، `/api/rounds/state`، `/api/admin/tiers/**` | بنیاد multi-tier |
| `src/lib/tierMath.ts`، `tierAccounting.ts`، `tierAdmin.ts`، `tierReports.ts`، `treasuryAccounting.ts` | محاسبات و تعهدات مالی |
| `src/lib/adminAudit.ts`، `nowpayments.ts`، `nowpaymentsApply.ts` | ممیزی و legacy safety |
| `supabase/migrations/20261125_multi_tier_pool_foundation.sql` | اساس سیستم multi-tier |
| تستهای `tier-engine`، `tier-accounting`، `multi-tier-schema`، `phase6-admin`، `phase7-ui` | کانترکتهای موجود |

### 2.5. ترتیب ایمن integration (برای Phase 2، اجرا نشده)

1. **فریز snapshots**: هش تمام فایلهای MAIN و WORKSPACE ثبت شود؛ BACKUP جداگانه گرفته شود.
2. **شاخهٔ integration**: از HEAD `2178d6af...` یک شاخهٔ کاری جدا ساخته شود.
3. **Schema export**: `src/db/schema.ts` و `supabase/schema.sql` و تمام migrationها به تفاوت دقیق مقایسه شوند.
4. **Diff طبقهبندی**: تغییرات به چهار گروه تقسیم شوند: Financial / Security / UX-i18n / Docs-Tests.
5. **Port تکماژوله**: هر ماژول WORKSPACE بهتنهایی با تست و review وارد شود؛ هیچ کپی کامل دایرکتوری.
6. **Migration forward-only**: فقط migration جدید اضافه شود؛ هیچ destruction، drop و backfill بدون Verify.
7. **Isolated DB**: تمام migrationها ابتدا روی دیتابیس ایزوله اجرا و با Supabase snapshot مقایسه شوند.
8. **Parity tests**: Drizzle و SQL از نظر جدول، ستون، CONSTRAINT و DEFAULT برابر شوند.
9. **Reconciliation dry-run**: لجر، vault، user balance و onchain با reported proof مقایسه شوند.
10. **Go/No-Go**: تنها پس از بند 8 این سند، کد به سمت live مجاز میشود.

### 2.6. اختلافهای بحرانی که باید قبل از port حل شوند

| اختلاف | شاهد | سیاست Phase 1B |
|---|---|---|
| `deposits.provider` DEFAULT: Drizzle `solana` / SQL `nowpayments` | `src/db/schema.ts` در برابر `supabase/schema.sql` |یکسانسازی به `solana` و حذف legacy default |
| `deposits.pay_currency` DEFAULT: Drizzle `USDC` / SQL `usdttrc20` | همان منبع |یکسانسازی به `USDC` |
| `withdrawals.network` DEFAULT: Drizzle `Solana` / SQL `TRC20` | همان منبع |یکسانسازی به `Solana` |
| `treasury_transactions_tier_round_idx`: `uniqueIndex` در Drizzle / index معمولی در SQL | `src/db/schema.ts` و `supabase/schema.sql` |حذف uniqueness نادرست و جایگزینی با unique بر event identity |
| CHECK constraints فقط در SQL وجود دارند | migrationها در برابر Drizzle |همه CONSTRAINTها در هر دو منبع تعریف شوند |

---

## 3. طراحی Schema جدید دیتابیس (Drizzle + Supabase)

### 3.1. اصول حاکم

1. **Append-only ledger**: هیچ بهروزرسانی یا حذف ردیف مالی وجود ندارد؛ اصلاحات فقط با entry جبرانی انجام میشود.
2. **Immutable tier snapshot**: هر دور، نسخهای قفلشده از سیاست Tier خود دارد؛ تغییر Tier بعد از شروع دور اثری بر آن دور ندارد.
3. **صحت مالی در DB**: invariants مالی فقط در لایهٔ نرمافزار نمانده و با CONSTRAINT / trigger / transaction قابلتأیید باشند.
4. **Drizzle/Supabase parity**: هر جدول، ستون، enum، DEFAULT و CONSTRAINT در هر دو منبع یکسان باشد.
5. **Migration forward-only**: هیچ migration مخرب، بدون backfill و بدون Verify اضافه نشود.
6. **Security by schema**: KYC، RBAC، Geo و idempotency دارای ستون و domain مشخص باشند.
7. **No live flag**: تا زمانی که integrity proof نتیجهٔ PASS نداده است، readiness بسته باقی میماند.

### 3.2. خلاصهٔ جدولهای پیشنهادی

#### 3.2.1. Tier و policy

**`ticket_tiers`** — رکورد عملیاتی 7 Tier:

- `id`, `code` UNIQUE, `tier_number` UNIQUE, `name`
- `price_usd` numeric(12,2) > 0
- `ticket_capacity` integer > 0
- `prize_percent`, `vault_percent`, `site_percent` با CONSTRAINT مجموع 100
- `winner_count` = 3
- `draw_duration_minutes`, `minimum_participants`, `maximum_participants`
- `max_user_pool_percent` = 20
- `refund_window_hours` = 72
- `kyc_level_required`
- `status` CHECK IN (`ACTIVE`, `INACTIVE`, `ARCHIVED`)
- `display_order`, `created_at`, `updated_at`

دقیقاً 7 رکورد مطابق جدول 2.1 سند Phase 1A seed میشود: `starter_1`، `bronze_5`، `silver_10`، `gold_25`، `platinum_50`، `diamond_100`، `vip_whale_200`.

**`tier_policy_versions`** — نسخهٔ غیرقابلتغییر سیاست:

- `id`, `tier_id` FK, `version`
- `price_usd`, `capacity`, `prize_percent`, `vault_percent`, `site_percent`
- `winner_amounts_usd` jsonb شامل دقیقاً سه مبلغ به ترتیب نفر اول، دوم، سوم
- `vault_growth_percent` = 80، `vault_development_percent` = 20
- `referral_rate_percent` = 2
- `referral_event_timing` CHECK IN (`POST_SETTLEMENT`) — **FINAL / APPROVED**
- `referral_blocked_on_refund` boolean = true — **FINAL / APPROVED**
- `weekly_jackpot_enabled` boolean
- `refund_window_hours` = 72
- `refund_destination` CHECK IN (`WALLET`) — **FINAL / APPROVED**
- `rollover_target_policy` text = `SAME_TIER_NEXT_ACTIVE` — **FINAL / APPROVED**
- `kyc_cumulative_withdrawal_threshold_usd` = 500
- `kyc_cumulative_window` = `LIFETIME` — **FINAL / APPROVED**
- `age_minimum` = 18، `age_enforcement` = `SERVER` — **FINAL / APPROVED**
- `geo_block_enforcement` = `SERVER` — **FINAL / APPROVED**
- `vrf_provider_interface` = `MODULAR_PROVIDER` — **FINAL / APPROVED**
- `kyc_provider_interface` = `MODULAR_PROVIDER` — **FINAL / APPROVED**
- `live_fail_closed_until_provider_verified` boolean = true — **FINAL / APPROVED**
- `status`, `effective_at`, `created_at`
- UNIQUE (`tier_id`, `version`)
- CONSTRAINT: جمع درصدها = 100؛ جمع رشد / توسعه = 100؛ طول آرایهٔ جوایز = 3
- CONSTRAINT: هیچ Referral قبل از `SETTLED` و هیچ Referral روی راند `REFUNDED` مجاز نیست
- CONSTRAINT: در حالت live، تا زمانی که providerهای VRF و KYC تأیید و تست نشدهاند، تمام مسیرهای مالی fail-closed اند

یادداشت: مبالغ جدول Phase 1A بهصورت سنت دقیق ذخیره میشوند تا اعشار 13⅓٪ / 6⅔٪ موجب خطای مرکز نشود.

#### 3.2.2. دور، بلیت و برنده

**`rounds`**:

- `id`, `tier_id`, `tier_policy_version_id` FK
- `status` CHECK IN (`OPEN`, `FULL`, `AWAITING_ADMIN_APPROVAL`, `APPROVED`, `SETTLED`, `CANCELLED`, `REFUND_PENDING`, `REFUNDED`, `ROLLED_OVER`)
- `capacity`, `sold`, `total_pool_usd`, `prize_total_usd`, `vault_total_usd`, `site_total_usd`
- `opened_at`, `closes_at`, `expires_at` = `opened_at + 72 hours`
- `rollover_to_round_id` self FK قابل nullable
- `refund_policy` CHECK IN (`REFUND`, `ROLLOVER`, `NONE`)
- `commitment_id`, `settlement_id`
- CONSTRAINT: `sold <= capacity`؛ مبالغ برابر policy snapshot باشند

**`round_winners`** — جایگزین تکبرنده شدن `rounds.winner_id`:

- `id`, `round_id`, `place` CHECK IN (1,2,3)
- `ticket_id` FK, `user_id` FK, `winning_serial`
- `prize_amount_usd`, `prize_share_json`
- `ledger_reference` UUID UNIQUE
- `reveal_id` FK
- UNIQUE (`round_id`, `place`)، UNIQUE (`round_id`, `ticket_id`)
- CONSTRAINT: سه برندهٔ متمایز قبل از settlement

**`tickets`**:

- `id`, `round_id`, `user_id`, `tier_policy_version_id`
- `amount_usd`, `serial` UNIQUE
- `purchase_ledger_id` FK
- `refunded` boolean, `rolled_over_to_ticket_id` self FK
- `kyc_level_at_purchase`, `jurisdiction_at_purchase`, `terms_version`
- `created_at`

**`round_user_exposure`** — اعمال سقف 20%:

- `round_id`, `user_id`, `tickets_count`, `amount_usd`
- UNIQUE (`round_id`, `user_id`)
- CONSTRAINT / trigger: `tickets_count <= floor(capacity × max_user_pool_percent / 100)`

#### 3.2.3. قرعه و اثبات randomness

**`draw_commitments`**:

- `id`, `round_id` UNIQUE
- `algorithm_version`, `server_seed_hash`, `client_seed`
- `client_seed_source` CHECK IN (`PLAYER`, `OPERATOR`, `EXTERNAL_VRF`)
- `nonce_base`, `ticket_snapshot_hash`, `committed_at`, `revealed_at`
- `status` CHECK IN (`COMMITTED`, `REVEALED`, `CANCELLED`)
- CONSTRAINT: فیلدهای commitment پس از شروع فروش immutable باشند

**`draw_reveals`**:

- `id`, `commitment_id`, `round_id`, `place`
- `nonce` UNIQUE (`commitment_id`, `nonce`)
- `random_value`, `winning_index`, `ticket_id`, `serial`
- `proof_payload` jsonb, `computed_at`
- UNIQUE (`round_id`, `place`)

#### 3.2.4. لجر، خزانه و جریانهای مالی

**`ledger`** — append-only:

- `id`, `event_id` UUID, `transaction_key` UNIQUE, `reference` UUID UNIQUE
- `account` CHECK IN (`USER`, `VAULT_GROWTH`, `VAULT_RESERVE`, `SITE_REVENUE`, `PRIZE_ESCROW`, `EXTERNAL`)
- `type` CHECK IN شامل `ticket_buy`, `prize_payout`, `vault_inflow`, `vault_growth_credit`, `vault_reserve_credit`, `referral_debit`, `jackpot_debit`, `refund`, `rollover`, `withdraw`, `fee`, `compensation`
- `direction` CHECK IN (`DEBIT`, `CREDIT`)
- `amount_usd` > 0
- `user_id`, `round_id`, `tier_id`, `winner_place`, `deposit_id`, `withdrawal_id`
- `actor_type`, `actor_id`, `before_balance`, `after_balance`, `note`, `created_at`
- CONSTRAINT: هر انتقال مالی حداقل دو entry متوازن با همان `event_id` دارد

**`vault`** — تک ردیف با قفل:

- `id` CHECK single-row
- `growth_balance_usd`, `reserve_balance_usd`
- `growth_split_percent` = 80، `development_split_percent` = 20
- `locked_reserve_floor_usd`
- `total_inflow_usd`, `total_growth_out_usd`, `total_reserve_out_usd`
- `updated_at`

**`vault_snapshots`**:

- `id`, `vault_id`, `bucket` CHECK IN (`GROWTH`, `RESERVE`)
- `delta_usd`, `balance_after_usd`, `event_id`, `reason`
- UNIQUE (`event_id`, `bucket`)، FK به round/winner در صورت وجود

**`treasury_transactions`**:

- `id`, `tier_id`, `round_id`, `ledger_id`
- `direction` CHECK IN (`IN`, `OUT`)
- `category` CHECK IN (`PRIZE`, `VAULT_GROWTH`, `VAULT_RESERVE`, `SITE_REVENUE`, `REFERRAL`, `JACKPOT`, `REFUND`, `ROLLOVER`, `WITHDRAWAL`)
- `amount_usd`, `wallet_address`, `tx_hash`, `signature_status`
- `status` CHECK IN (`PENDING`, `POSTED`, `FAILED`)
- UNIQUE (`event_id`, `category`) — جایگزین uniqueness نادرست `(tier_id, round_id)`

**`fee_transfers` / `site_revenue_entries`**:

- یک ردیف در هر دور برای سهم سایت 10% یا 8% مطابق policy snapshot
- `amount_usd`, `status`, `ledger_reference`, `tx_hash` اختیاری
- CONSTRAINT: مبلغ برابر `site_percent × total_pool`

**`referral_events`**:

- `id`, `inviter_user_id` FK, `invitee_user_id` FK
- `qualifying_event_type` = `ROUND_SETTLED` — **FINAL / APPROVED**
- `source_round_id` FK, `settlement_id` FK, `source_amount_usd`
- `rate_percent` = 2، `amount_usd`
- `growth_bucket_ledger_id` FK
- `blocked_by_refund` boolean = true — **FINAL / APPROVED**
- UNIQUE (`invitee_user_id`, `qualifying_event_type`, `source_round_id`)
- CONSTRAINT: منبع پرداخت فقط `VAULT_GROWTH` است و وضعیت راند مبدأ باید `SETTLED` باشد
- CONSTRAINT: راندی که به `REFUNDED` ختم شود، هیچ ردیف Referral ایجاد نمیکند

**`weekly_jackpots`**:

- `id`, `period_start`, `period_end`
- `allocated_amount_usd` از residual growth budget
- `eligibility_rule_version`, `winner_user_id`, `proof_payload`, `status`

**`refunds_and_rollovers`**:

- `id`, `round_id`, `user_id`
- `policy` CHECK IN (`REFUND`, `ROLLOVER`)
- `ticket_ids` jsonb, `amount_usd`
- `target_round_id` self FK برای rollover
- `ledger_event_id`, `status`, `created_at`
- UNIQUE (`round_id`, `user_id`, `policy`)

#### 3.2.5. انطباق، امنیت و اپراتورها

**`users`** — اضافات:

- `age_status` CHECK IN (`UNVERIFIED`, `VERIFIED`, `REJECTED`, `EXPIRED`)
- `age_verified_at`, `terms_version_accepted`
- `kyc_status` CHECK IN (`NOT_STARTED`, `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`)
- `kyc_level`, `kyc_provider_ref`, `kyc_verified_at`, `kyc_expires_at`
- `country_at_signup`, `sanctions_status`
- `referrer_user_id` FK معتبر (جایگزین صرفاً کد)

**`kyc_reviews`** — `id`, `user_id`, `reviewer_operator_id`, `decision`, `reason`, `evidence_ref`, `created_at`.

**`jurisdiction_checks`** — `id`, `user_id`, `request_id`, `country`, `source`, `trusted_header_signature`, `decision`, `created_at`.

**`admin_operators` / `admin_sessions` / `admin_permissions`**:

- operator دارای `id`، `status`، `display_name`، `credential_version`
- session کوتاهعمر، HttpOnly/Secure/SameSite، قابل revocation
- permission matrix:.role × resource × action
- VIEWER فقط خواندنی؛ تمام اقدامات مالی و عملیاتی ADMIN-only و action-gated

**`admin_audit_events`**:

- `id`, `operator_id` اجباری، `actor_snapshot`, `role_at_action`
- `request_id`, `ip`, `user_agent`, `action`, `entity`, `entity_id`
- `reason`, `before_hash`, `after_hash`, `event_hash`, `prev_hash`
- hash-chain یا signature برای tamper-evidence
- ثبت احراز هویت ناموفق، denial، sensitive read و تمام تغییرات مالی/config

**`integrity_proofs`**:

- `id`, `algorithm_version`, `generated_at`, `payload` jsonb
- `payload_hash`, `verifier_signature`
- `result` CHECK IN (`PASS`, `FAIL`)
- `blocked_reason`

**`automation_jobs`**:

- `id`, `trigger` CHECK IN (`CRON`, `ADMIN`, `SYSTEM`)
- `lease_until`, `status`, `idempotency_key` UNIQUE
- `steps_report` jsonb, `retry_count`, `operator_id`, `created_at`, `finished_at`
- حذف کامل مسیر `traffic`

### 3.3. ترتیب migration پیشنهادی (اجرا نشده)

| شماره | مهاجرت | هدف | دروازه |
|---|---|---|---|
| M1 | `tier_policy_versions` + seed 7 Tier | اعمال جدول Phase 1A | Verify.sum = 5,550 |
| M2 | users KYC / age / jurisdiction | الزام +18، >$500، Tier 6/7 | Verify no NULL in required fields |
| M3 | round policy snapshot + 72h + rollover | قانون انقضای استخر | Verify expires_at = opened_at + 72h |
| M4 | round_winners + draw_reveals | سه برنده و randomness جدید | Verify 3 distinct winners |
| M5 | vault growth/reserve + referral + jackpot | تقسیم 80/20 و 2% | Verify no debit from reserve |
| M6 | refunds_and_rollovers | Refund 100% / Rollover | Verify compensation ledger |
| M7 | admin operators/sessions/permissions/audit | RBAC و attribution | Verify no generic actor |
| M8 | integrity_proofs + automation_jobs | fail-closed proof و job safety | Verify no traffic trigger |
| M9 | reconciliation legacy drift | solana/USDC defaults و index drift | Verify Drizzle=SQL |

هیچ migration نباید بهتنهایی disruptive باشد؛ backfill، Verify و سپس activation بهصورت جداگانه انجام میشود.

### 3.4. قوانین Drizzle / Supabase parity

- از `pgEnum` معادل `CREATE TYPE` در SQL استفاده شود.
- تمام CHECKها در هر دو منبع تعریف شوند.
- DEFAULTها در دو منبع برابر باشند.
- INDEXها و UNIQUEها در دو منبع برابر باشند.
- خروجی `drizzle-kit generate` بازبینی شود؛ هرگز `drizzle-kit push` روی live اجرا نشود.
- یک تست parity شمار جدول، ستون، نوع، DEFAULT، CONSTRAINT و INDEX را مقایسه کند.

---

## 4. جریانهای مالی و محاسباتی Phase 1B

### 4.1. خرید بلیت

1. Compliance gate: سن +18، Geo، KYC در صورت نیاز، سقف 20%.
2. بارگذاری policy snapshot دور.
3. محاسبهٔ مبلغ و ثبت ledger `ticket_buy` در همان transaction.
4. بهروزرسانی `round_user_exposure` و `rounds.sold`.
5. هیچ قرعهای بلافاصله انجام نشود؛ دور تا ظرفیت یا 72 ساعت باقی میماند.

INVARIANT: `round_user_exposure.tickets_count <= floor(capacity × 20 / 100)`.

### 4.2. تسویه

1. بررسی consensus: سه برندهٔ متمایز، commitment معتبر، nonce مصرفنشده.
2. محاسبه از policy snapshot:
   - `prize_total = pool × prize_percent`
   - `vault_total = pool × vault_percent`
   - `site_total = pool × site_percent`
   - `prize_total = sum(winner_amounts)`
3. نوشتن ledger entries جبرانی و treasury transactions.
4. Vault split: 80% به `VAULT_GROWTH`، 20% به بودجهٔ development.
5. Referral (FINAL): کمیسیون 2% فقط **پس از تکمیل و تسویهٔ موفق استخر** و فقط از `VAULT_GROWTH` ثبت میشود؛ در Refund 72 ساعته ثبت نمیشود.
6. Site revenue بدون کاهش باقی میماند.

INVARIANT: `prize_total + vault_total + site_total = total_pool`.

### 4.3. Refund / Rollover در 72 ساعت

1. Job مخصوص expire، فقط توسط CRON یا ADMIN.
2. کاربر میتواند **Refund 100% به کیف پول** یا **Rollover به استخر جدید همان Tier** را انتخاب کند — **FINAL / APPROVED**.
3. اگر policy = `REFUND`: بازگشت 100% مبلغ بلیت با ledger `refund` و **بدون هیچ کمیسیون Referral**.
4. اگر policy = `ROLLOVER`: انتقال بلیت به دور بعد فعال همان Tier و ledger `rollover`؛ کمیسیون Referral در صورت مشمولیت، فقط پس از تسویهٔ موفق دور مقصد ثبت میشود.
5. هر دو با `event_id` و `transaction_key` idempotent اند.

INVARIANT: مجموع Refund + Rollover + Prize + Vault + Site برابر کل پول واردشده است.

### 4.4. گزارش integrity proof

خلاصهٔ خروجی `integrity_proofs.payload`:

- confirmed onchain USDC balance + signature/slot
- sum(user balances) برابر sum(user ledger credits-debits)
- vault growth/reserve balances برابر vault_snapshots
- pending withdrawals و unmatched deposits
- open round commitments
- per-tier obligations طبق 7 Tier
- posted/pending outflows
- تمام invariantها با PASS/FAIL

هر FAIL = مسدود کردن settlement، payout، fee posting، automation مالی و readiness.

---

## 5. رفع 5 مانع امنیتی Phase 0

### 5.1. حذف اجرای اتوماسیون از `GET /api/state`

| مورد | شاهد فعلی |
|---|---|
| Public GET automation | `src/app/api/state/route.ts:7-12` — `after(maybeRunAutomation)` |
| Traffic runner | `src/lib/automation.ts:519-525` |
| Full job شامل deposits / draws / refunds / payouts | `src/lib/automation.ts:482-516` |
| Read itself writes | `src/lib/store.ts:1697-1702` → `ensureOpenRound()` → insert |

طرح Phase 1B:

- `/api/state` تبدیل به pure read snapshot میشود: بدون `after`، بدون `maybeRunAutomation`، بدون `ensureOpenRound`، بدون INSERT/UPDATE/DELETE.
- نمایش «no active round» مجاز است؛ ایجاد دور فقط توسط ADMIN یا scheduler.
- تنها دو ورودی مجاز automation: CRON با `CRON_SECRET` و ADMIN action با maintenance guard.
- حذف کامل trigger `traffic`.
- تمام jobها در `automation_jobs` با lease، idempotency، retry و audit ثبت شوند.
- تست قراردادی: هرگونه فراخوانی `after` / `maybeRunAutomation` در route state، FAIL است.

### 5.2. جایگزینی توکن مشترک ادمین با RBAC و لاگ ممیزی

| مورد | شاهد فعلی |
|---|---|
| فقط دو نقش | `src/lib/admin.ts:5-28` |
| توکن ثابت env | `src/lib/config.ts:64-69` |
| ذخیره در sessionStorage | `src/app/admin/page.tsx:44-75,125-141` |
| actor literal "admin" | `src/app/api/admin/rounds/open/route.ts:19` و سایر routeها |
| audit فاقد operator id | `src/db/schema.ts:190-198` |

طرح Phase 1B:

- `admin_operators` + `admin_sessions` + `admin_permissions` جایگزین `x-admin-token` بهعنوان هویت میشوند.
- session ادمین HttpOnly، Secure، SameSite و قابل revocation است.
- permission matrix در سمت سرور و قبل از بدنهٔ handler اعمال میشود.
- VIEWER فقط read؛ تمام اقدامات مالی / Tier / KYC / automation ADMIN-only و action-gated.
- لاگ ممیزی با `operator_id`، role، request id، IP، before/after hash و event hash-chain.
- ثبت لاگ برای authentication failures، permission denials، sensitive reads و mutations.
- ردیفهای قدیمی `admin` / `viewer` بهصورت صریح migrate و برچسب legacy میخورند، نه اینکه به اپراتور دلخواه نسبت داده شوند.
- rate limiting، lockout، geo gate و server-side `/admin` shell gate اضافه میشود.

### 5.3. اثبات یکپارچگی لجر و خزانه

| مورد | شاهد فعلی |
|---|---|
| reconciliation ADMIN-only و زنده | `src/app/api/admin/reports/reconciliation/route.ts:8-15` |
| وضعیت سطحی در state | `src/lib/store.ts:1713-1726,1937-1940` |
| health فقط alert میدهد | `src/lib/automation.ts:374-425` |
| RPC غیراستاندارد | `src/lib/store.ts:45-61` — `getParsedTransaction` |
| blocker سختکدشده | `src/lib/readiness.ts:22` |

طرح Phase 1B:

- لجر بهعنوان تنها منبع حقیقت مالی append-only است.
- هر حرکت پولی با event_id، transaction_key، account، reference و قبل/بعد balance در یک transaction ثبت میشود.
- `integrity_proofs` یک خروجی نسخهدار، قابل هش و قابل export تولید میکند.
- تطابق: user balances، vault growth/reserve، user ledger، open commitments، per-tier obligations، onchain confirmed balance، posted outflows.
- Fail-closed: هر mismatch، RPC failure، tx hash مفقود، legacy quarantine یا coverage نامشخص = توقف settlement/payout/fee/readiness.
- تأیید onchain با RPC استاندارد و finalized/confirmed signature شامل mint، sender، recipient و amount.
- تستها شامل double-credit، idempotent settlement، refund path، reorg، RPC failure، ledger drift، vault drift و proof tampering.

### 5.4. ارتقای randomness قرعهکشی

| مورد | شاهد فعلی |
|---|---|
| فقط یک seed سرور | `src/lib/store.ts:235-239` |
| HMAC سادهمحور | `src/lib/store.ts:443-449` |
| `clientSeed: null` و `drawNonce: 0` | `src/lib/store.ts:921-945` |
| verify فقط server seed | `src/app/[locale]/verify/[round]/page.tsx:35-36,54-55,75-79` |
| ماژول randomness در MAIN وجود ندارد | بررسی read-only |

طرح Phase 1B:

- **هدف نهایی live: VRF قابلتأیید از منبع خارجی (Switchboard/Orao یا معادل تأییدشده توسط مالک)**.
- **تصمیم نهایی (FINAL / APPROVED):** طراحی با **رابط ماژولار Provider interface** برای VRF خارجی قابلراستیآزمایی انجام میشود؛ ارائهدهندهٔ نهایی در گیت integration انتخاب میشود.
- **Fail-closed در live:** تا زمانی که اتصال Provider و تست آن تکمیل نشده است، قرعهکشی live money و تسویه مسدود اند.
- تا قبل از استقرار VRF، حالت live money بسته میماند؛ commit-reveal خارجی فقط در demo/test و با تأیید مالک قابلاستفاده است.
- الگوریتم نسخهدار و ماژول خالص randomness ایجاد میشود؛ draw و verify تنها از آن فراخوانی میکنند.
- ورودی کانونیکال: `serverSeed`، `clientSeed` خارجی، `nonce`، `roundId`، `algorithmVersion`، snapshot مرتبشدهٔ ticket ids/serials.
- تبدیل digest به index با **unbiased rejection sampling**، بدون modulo bias و بدون `Math.random`.
- commitment قبل از فروش بلیت ذخیره و post-sale immutable میشود.
- هر place یک nonce مجزا دارد و مصرف nonce در `draw_reveals` قابلتأیید است.
- سه برندهٔ متمایز، reveal کامل و verify page با همان الگوریتم.
- admin approval و settlement با recompute proof fail-closed میشوند.

### 5.5. لایه کنترلهای قانونی / Geo / KYC در سمت سرور

| مورد | شاهد فعلی |
|---|---|
| Geo فقط با `GEO_BLOCK=on` | `src/lib/geo.ts:6-21` |
| country از header، ناشناخته مجاز | `src/lib/geo.ts:25-40` |
| rewrite فقط صفحات، api/admin مستثنی | `src/proxy.ts:27-39,47-48` |
| نبود assertRegion در مسیرهای متعدد | `src/lib/api.ts:33-37` و فهرست فراخوانیها |
| سن client-side | `src/components/Compliance.tsx` |
| KYC متصل نیست | `DEPLOY.md:140-161` |

طرح Phase 1B:

- یک compliance guard سرورساز واحد بر تمام routeهای state-changing، مالی و privileged اعمال میشود، شامل `/api/admin/**`.
- country فقط از منبع trusted با signature/provenance خوانده میشود؛ در live، country ناشناخته fail-closed است.
- ذخیرهٔ jurisdiction در signup و هر اقدام مالی؛ عدم تطابق account/session/request block میشود.
- سن +18 **در سمت سرور اجباری** است و با وضعیت، متد، timestamp، terms version و evidence reference ذخیره میشود — **FINAL / APPROVED**.
- Geo-blocking مناطق ممنوعه و تحریمی **در سمت سرور اجباری** است و توسط compliance guard اعمال میشود — **FINAL / APPROVED**.
- KYC state machine: `NOT_STARTED` / `PENDING` / `APPROVED` / `REJECTED` / `EXPIRED` با provider ref، level، expiry، webhook ایمن و audit.
- **پنجرهٔ تجمعی KYC (FINAL / APPROVED):** مبنا، مجموع تمام برداشتهای ثبتشدهٔ کاربر تا لحظهٔ درخواست (life-time cumulative) است.
- قواعد الزامی: مجموع برداشت تجمعی بالای $500 یا شرکت در Tier 6 / Tier 7 بدون KYC مسدود است.
- **KYC Provider interface ماژولار (FINAL / APPROVED):** سرویس KYC پشت رابط قابلجایگزینی قرار میگیرد و در live تا تکمیل اتصال و تست، fail-closed است.
- sanctions / PEP screening، re-verification و manual review با attributable audit.
- تستها: blocked/unknown/spoofed country، underage، terms version، KYC pending/rejected/expired، webhook replay و jurisdiction mismatch.

---

## 6. نقشهٔ فایلها و کانترکتهای Phase 2 (پیادهسازی کنترلشده آغاز شد)

```text
src/
  lib/
    tier-policy.ts          # single source for 7-tier math
    tier-snapshot.ts        # immutable snapshot loader
    draw-randomness.ts      # VRF-first, external seed, unbiased index
    draw-proof.ts           # recompute + verify
    ledger.ts               # append-only balanced postings
    vault-accounts.ts       # growth/reserve split
    referral-engine.ts      # 2% from growth, idempotent
    refund-rollover.ts      # 72h policy
    integrity-proof.ts      # versioned proof + fail-closed gate
    compliance-guard.ts     # age + geo + KYC server gate
    admin-rbac.ts           # operator identity + permission matrix
    audit-chain.ts          # hash-chained audit events
  app/api/
    state/route.ts          # pure read only
    cron/route.ts           # CRON_SECRET + maintenance guard
    admin/automation/route.ts # ADMIN + maintenance guard
    admin/reports/integrity/route.ts
    compliance/**           # age/KYC/jurisdiction
  db/schema.ts              # mirrored with supabase
supabase/
  schema.sql
  migrations/               # forward-only numbered phases
tests/
  phase1a-economy.test.mjs
  integrity-proof.test.mjs
  draw-randomness.test.mjs
  refund-rollover.test.mjs
  admin-rbac.test.mjs
  compliance-guard.test.mjs
docs/
  PHASE-1A-SPEC.md
  PHASE-1B-ARCHITECTURE.md
```

---

## 7. ماتریس تست و دروازههای Phase 2

| لایه | تست الزامی | دروازهٔ عبور |
|---|---|---|
| Economy | 7 Tier، جمع 5,550، سه برنده، 80/20، 2% | **PASS** در برابر Phase 1A |
| Schema | Drizzle=SQL parity، تمام CHECKها | **PASS** |
| Ledger | balanced entries، idempotency، compensation | **PASS** |
| Randomness | known vectors، tamper، nonce reuse، VRF proof | **PASS** |
| Refund/Rollover | 72h، 100% refund، rollover target | **PASS** |
| Admin RBAC | denial، actor attribution، hash chain | **PASS** |
| Compliance | age، geo، KYC threshold، sanctions | **PASS** |
| Automation | بدون traffic، maintenance guard، lease | **PASS** |
| Integrity | proof PASS و fail-closed | **PASS** |
| Legacy | quarantine و reconciliation موفق | **PASS** |

---

## 8. چکلیست مرحلهای ورود به Phase 2 (پیادهسازی کد)

| # | اقدام | مسئول | وضعیت | دروازه |
|---:|---|---|---|---|
| 1 | تأیید نهایی مالک بر `PHASE-1A-SPEC.md` و این سند | مالک | **APPROVED** | تأیید صریح مالک در همین دستور ثبت شد |
| 2 | بستن پارامترهای باقیمانده Phase 1A (جایزه تسلی، جکپات، Referral event، نیمهپر، پنجره تجمعی) | مالک | **APPROVED** | تسلی پلهای، جکپات هفتگی 50/30/20، Referral post-settlement، Refund/Rollover 72h و پنجره KYC نهایی شد |
| 3 | تأیید فهرست مناطق ممنوعه و تحریمی و سن قانونی هر Jurisdiction | حقوقی / مالک | **APPROVED — BASE LIST** | +18 سرور و Geo-blocking سرور قفل شد؛ `BLOCKED_JURISDICTIONS` پیشفرض `US,KP,IR,SY,CU,RU,BY,MM,AF`؛ تا live fail-closed |
| 4 | انتخاب ارائهدهنده KYC و VRF | مالک / فنی | **APPROVED — MODULAR INTERFACE** | Provider interface ماژولار و fail-closed در live نهایی شد؛ vendor در گیت integration تعیین میشود |
| 5 | فریز هش MAIN و WORKSPACE و تهیه backup جدا | فنی | **COMPLETED (SNAPSHOT)** | `F:\betx-lottery-main1\PRE-PHASE2-SNAPSHOT` بدون `.git`/`node_modules`؛ HEAD ثبت شد؛ branch `feat/phase2-architecture` از `2178d6af...` ایجاد شد |
| 6 | ایجاد شاخهٔ integration از HEAD `2178d6af...` | فنی | **COMPLETED** | Branch `feat/phase2-architecture` ساخته شد؛ `main` و WORKSPACE تغییری نکردند |
| 7 | اجرای M1–M9 روی دیتابیس ایزوله | فنی | **IMPLEMENTED — DB RUN PASS** | 9 migration فوروارد-only دو بار اعمال شدند؛ فقط `BETX_TEST_DATABASE_URL` localhost ایزوله استفاده شد |
| 8 | تست parity Drizzle / Supabase | فنی | **STATIC + DB PARITY PASS** | جدولها، ستونها و پارامترها در Drizzle و SQL مطابقت دارند؛ parity کاتالوگ DB نیز 37/37 PASS |
| 9 | پیادهسازی pure `/api/state` و حذف traffic trigger | فنی | **COMPLETED** | `after()` و `maybeRunAutomation` حذف شدند؛ `getState()` فقط خواندنی است؛ تست قرارداد PASS |
| 10 | پیادهسازی RBAC، operatorها و audit hash-chain | فنی | **IMPLEMENTED — WIRED** | Attribution PASS |
| 11 | پیادهسازی randomness VRF و سه برنده متمایز | فنی | **IMPLEMENTED — REPLAYABLE ADAPTER** | Proof replayable PASS — live fail-closed |
| 12 | پیادهسازی vault growth/reserve، referral و jackpot | فنی | **IMPLEMENTED — WIRED** | 80/20 + 2% PASS |
| 13 | پیادهسازی Refund / Rollover 72 ساعت | فنی | **IMPLEMENTED — WIRED** | 100% reconcile PASS |
| 14 | پیادهسازی compliance guard سرورساز | فنی / حقوقی | **IMPLEMENTED — KYC ADAPTER** | Fail-closed PASS — KYC adapter ready |
| 15 | پیادهسازی integrity proof و readiness gate | فنی | **IMPLEMENTED — WIRED** | No FAIL allowed |
| 16 | اجرای کامل تستها، typecheck، lint و build مجاز | فنی | **IMPLEMENTED — VERIFIED** | All green |
| 17 | بررسی امنیتی مستقل و replay حوادث | auditor | **IMPLEMENTED — ADAPTERS + ACTOR BOUND** | Independent PASS — adapter و actor مخاطرهها حل شدند |
| 18 | تمرین backup/restore و rollback | فنی | **COMPLETED — RESTORE VERIFIED** | Restore verified — live untouched |
| 19 | تصمیم Go / No-Go مالک | مالک | **NO-GO / PENDING OWNER DECISION** | Explicit GO only |

**قانون خروج:** تا زمانی که تمام ردیفهای 1–18 **PASS** و ردیف 19 **GO** نشده است، disabling maintenance، payments، payouts یا live mode ممنوع است.

---

## 9. وضعیت نهایی و گزارش کار

| مورد | نتیجه |
|---|---|
| مرجع نهایی بین MAIN و WORKSPACE مشخص شد | **MAIN** بهعنوان canonical، WORKSPACE بهعنوان donor |
| روش ایمن integration بدون از دست رفتن data مشخص شد | بند 2.5 و 2.6 |
| Schema جدید برای 7 Tier، سه برنده، لجر، Vault و Refund طراحی شد | بند 3 |
| 5 مانع امنیتی Phase 0 پوشش داده شد | بند 5 |
| چکلیست ورود به Phase 2 ارائه شد | بند 8 |
| پارامترهای نهایی ردیفهای 2–5 ثبت شدند | بند 3.2.1، 3.2.4، 4.2، 4.3، 5.4، 5.5 و بند 8 |
| وضعیت ردیف 1–5 چکلیست: APPROVED / APPROVED / APPROVED — BASE LIST / APPROVED — MODULAR INTERFACE / COMPLETED (SNAPSHOT) | بند 8 |
| وضعیت ردیف 6–9 چکلیست: COMPLETED / IMPLEMENTED — DB RUN PASS / STATIC + DB PARITY PASS / COMPLETED | بند 8 |
| وضعیت ردیف 10–18 چکلیست: WIRED / REPLAYABLE ADAPTER / KYC ADAPTER / ADAPTERS + ACTOR BOUND / RESTORE VERIFIED | بند 8، 9.1، 9.2، 9.3 |
| شاخهٔ Phase 2 | `feat/phase2-architecture` از `2178d6af148df771a24e2bcd4902b7b56dcddfe6` |
| تغییر کد / migration | **انجام شد، منحصراً روی شاخهٔ Phase 2** |
| ادغام یا تغییر `main` / WORKSPACE | **انجام نشد** |
| نتیجه typecheck / lint / test / build | **PASS / PASS / 62 pass, 0 fail, 2 skipped / PASS** (اجرای ایزوله DB: 61 pass, 0 fail, 1 skipped) |
| وضعیت Phase 2 | **CONTROLLED IMPLEMENTATION COMPLETE — ADAPTERS VERIFIED / GO-NO-GO باقی است** |

### 9.1. وضعیت ردیفهای 10 تا 16 چکلیست Phase 2

| ردیف | اقدام | وضعیت | ماژول |
|---:|---|---|---|
| 10 | RBAC، operatorها و audit hash-chain | IMPLEMENTED — OPERATOR-BOUND | `src/lib/admin.ts`، `src/lib/adminRbac.ts`، `src/lib/auditChain.ts`، `src/lib/phase2Runtime.ts` |
| 11 | randomness VRF و سه برنده متمایز | IMPLEMENTED — REPLAYABLE ADAPTER | `src/lib/drawRandomness.ts`، `src/lib/phase2Policy.ts`، `src/lib/phase2Runtime.ts` |
| 12 | vault growth/reserve، referral و jackpot | IMPLEMENTED — WIRED | `src/lib/vaultAccounts.ts`، `src/lib/rewardEngine.ts` |
| 13 | Refund / Rollover 72 ساعت | IMPLEMENTED — WIRED | `src/lib/refundRollover.ts`، `src/lib/store.ts`، `src/lib/automation.ts` |
| 14 | compliance guard سرورساز | IMPLEMENTED — KYC ADAPTER | `src/lib/complianceGuard.ts`، `src/lib/kycProvider.ts`، `src/lib/phase2Policy.ts` |
| 15 | integrity proof و readiness gate | IMPLEMENTED — WIRED | `src/lib/integrityProof.ts`، `src/lib/readinessGate.ts` |
| 16 | بررسی تراکنشها، فرایندها و اسکریپتها | IMPLEMENTED — VERIFIED | `src/lib/phase2Runtime.ts`، `src/app/api/health/route.ts` |

تمام ماژولها و اتصالات ردیفهای 10 تا 16 fail-closed اند و هیچگونه پرداخت، برداشت، live mode یا خروج از maintenance mode را فعال نمیکنند. M1–M9 و parity روی دیتابیس ایزوله PASS شدند؛ فقط تست TLS بهدلیل نبود harness skipped باقی ماند.

### 9.2. ردیف 17 — بررسی امنیتی مستقل و replay ریسک

ماژول `src/lib/phase2SecurityAudit.ts` یک ممیزی استاتیک مستقل از مسیرهای حساس انجام میدهد و نتیجه آن در `tests/phase2-controls.test.mjs` پین شده است.

| شناسه | حوزه | نتیجه | یافته |
|---|---|---|---|
| SEC-01 | admin-authorization | PASS | تمام 13 route ادمین قبل از خواندن بدنه، احراز هویت و مجوز سرورساز را بررسی میکنند. |
| SEC-02 | audit-chain | PASS | زنجیره هش تأییدشده در `/api/admin/audit` در کنار لاگ legacy نمایش داده میشود. |
| SEC-03 | health-readiness | PASS | `/api/health` وضعیت readiness را بدون اثر مالی ارائه میدهد. |
| SEC-04 | reconciliation-proof | PASS | `/api/admin/reports/reconciliation` شامل خلاصه proof و readiness است. |
| SEC-05 | sensitive-compliance | PASS | buy، spin، withdraw، claim و deposit از گارد سن/جغرافیا/KYC سرورساز عبور میکنند. |
| SEC-06 | payment-guard | PASS | مسیرهای مالی `paymentsEnabled` را قبل از اثر پرداختی بررسی میکنند. |
| SEC-07 | state-isolation | PASS | `GET /api/state` خواندنی است و `after()` / automation trigger ندارد. |
| SEC-08 | live-vrf-fail-closed | PASS | در live بدون VRF تأییدشده، قرعهکشی fail-closed است. |
| SEC-09 | compliance-policy | PASS | سن +18 و 9 jurisdiction ممنوعه سرورساز ثبت شدند. |
| SEC-10 | financial-broadcast | PASS | broadcast Solana توسط kill-switch سرورساز مسدود میشود مگر authorization صریح وجود داشته باشد. |
| SEC-11 | fail-closed-defaults | PASS | پیشفرضها maintenance=ON، payments=OFF و readiness fail-closed اند. |
| SEC-12 | kyc-provider-adapter | PASS | آداپتور KYC ماژولار آستانه 500$ و Tier 6 را پوشش میدهد و در live fail-closed است. |
| SEC-13 | vrf-replayable-adapter | PASS | proof VRF قابل replay و بررسی دستکاری است و قرعهکشی از خروجی همان آداپتور استفاده میکند. |
| SEC-14 | admin-actor-binding | PASS | actor ممیزی از هش توکن operator/session مشتق و در زنجیره ممیزی ثبت میشود. |

ریسکهای باقیمانده ثبتشده:

| شناسه | شدت | خلاصه | وضعیت |
|---|---|---|---|
| RISK-DB-ISOLATION | HIGH | M1–M9 و parity روی `BETX_TEST_DATABASE_URL` ایزوله PASS | RESOLVED — ISOLATED DB PASS |
| RISK-VRF-VENDOR | HIGH | ارائهدهنده VRF واقعی انتخاب نشده | MITIGATED — REPLAYABLE ADAPTER / LIVE FAIL-CLOSED |
| RISK-KYC-VENDOR | HIGH | ارائهدهنده KYC واقعی متصل نشده | MITIGATED — SIMULATED ADAPTER / LIVE FAIL-CLOSED |
| RISK-AUDIT-ACTOR | MEDIUM | actor ممیزی ادمین به fingerprint توکن session/operator متصل شد | RESOLVED — OPERATOR-BOUND |
| RISK-CONDITIONAL-ERRORS | MEDIUM | مسیر مشروط PostgreSQL/TLS ایزوله بهجز TLS پوشش تست کامل ندارد | PARTIAL — DB PASS / TLS SKIPPED |
| RISK-OWNER-DECISION | HIGH | تصمیم Go/No-Go مالک باقی است | OPEN — PENDING OWNER DECISION |

replay حوادث با تستها پوشش داده شد: session منقضی، دستکاری زنجیره ممیزی، عدم تطابق و replay proof VRF، برنده تکراری، referral پیش از settlement،geo/KYC ناموفق، fall-back fail-closed KYC در live، عدم تطابق integrity proof و پیشفرض maintenance/payments.

### 9.3. ردیف 18 — تمرین Backup/Restore و Rollback

- اسنپشات مرجع: `F:\betx-lottery-main1\PRE-PHASE2-SNAPSHOT` با `HEAD=2178d6af148df771a24e2bcd4902b7b56dcddfe6`، `branch=main` و `staged=0` تأیید شد.
- فاقد `.git` و `node_modules` است و 7 فایل کلیدی شامل `PHASE2-BASELINE.txt`، `package.json`، `tsconfig.json`، `src/db/schema.ts`، `src/lib/store.ts`، `supabase/schema.sql` و `docs/PHASE-1B-ARCHITECTURE.md` در آن موجودند.
- تمرین عملی در پوشه موقت `F:\betx-lottery-main1\PHASE2-RESTORE-DRILL-20261126-163741` انجام شد: 7 فایل با هش SHA256 برابر بازیابی شدند، ورودی ممنوعهای یافت نشد و پوشه موقت پس از تأیید حذف شد.
- مسیر بازگشت شاخه/فایلها (فقط مستند، اجرا نشد): ثبت status/HEAD، `git stash push --include-untracked`، `git switch main`، `git restore --source=2178d6af... -- .`، پیشنمایش `git clean -nd` و سپس `git clean -fd` با تأیید مالک، بازیابی اسنپشات با `robocopy /E /XD .git node_modules`، اجرای `npm run typecheck && npm test` و بازگشت با `git switch feat/phase2-architecture && git stash pop`.
- چکلیست بازیابی دیتابیس: فقط `BETX_TEST_DATABASE_URL` ایزوله localhost با نام `betx_*test` مجاز است؛ `DATABASE_URL` live unset میماند؛ `pg_restore` از بکاپ تأییدشده، اعمال M1–M9 و اجرای `npm test` الزامی است. اجرای ایزوله با `betx_phase2_test` دو بار PASS شد و جزئیات در `F:\betx-lottery-main1\BETX-PHASE2-ISOLATED-DB-REPORT.txt` ثبت است.
- چکلیست تنظیمات: مقایسه `.env.example` و `.env.test.example` با اسنپشات، بدون خواندن یا کپی کردن `.env.local` و بدون اتصال به live.
- نتیجه ردیف 19 همچنان `NO-GO / PENDING OWNER DECISION` است و هیچ commit یا merge انجام نشد.

**END OF PHASE 1B ARCHITECTURE**
