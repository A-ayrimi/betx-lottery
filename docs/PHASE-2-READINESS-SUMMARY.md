# BETX Phase 2 — خلاصه آمادگی و بایگانی رسمی

تاریخ: 2026-11-26  
مخزن: `F:\betx-lottery-main`  
شاخه کاری: `feat/phase2-architecture`  
وضعیت کلی: **CONTROLLED IMPLEMENTATION COMPLETE — GO/NO-GO باقی است**

---

## 1. خلاصه اجرایی و وضعیت مرجع

| مورد | وضعیت ثبتشده |
|---|---|
| شاخه integration | `feat/phase2-architecture` |
| کامیت مرجع `main` | `2178d6af148df771a24e2bcd4902b7b56dcddfe6` |
| HEAD فعلی | `2178d6af148df771a24e2bcd4902b7b56dcddfe6` |
| مسیر بکاپ | `F:\betx-lottery-main1\PRE-PHASE2-SNAPSHOT` |
| بازیابی بکاپ | تأییدشده؛ 7 فایل کلیدی با SHA256 برابر بازیابی شدند |
| `WORKSPACE` | `F:\betx-lottery-main1\betx-lottery-main` — donor-only، بدون `.git`، دستنخورده |
| commit / merge / deploy | انجام نشد |
| `MAINTENANCE_MODE` | ON / قفلشده |
| پرداخت و برداشت | OFF / قفلشده |
| حالت `live` | OFF / fail-closed |
| ارائهدهنده VRF واقعی | متصل نشده؛ live fail-closed |
| ارائهدهنده KYC واقعی | متصل نشده؛ live fail-closed |

قفلهای ایمنی فعال:

- `DEFAULT_RUNTIME_FLAGS` در `src/lib/readinessGate.ts` شامل `maintenanceMode: true`، `paymentsEnabled: false`، `liveMode: false`، `vrfProviderReady: false`، `kycProviderReady: false` و `dbMigrationsApplied: false` است.
- `GET /api/state` خواندنی است و هیچ `after()` یا automation trigger ندارد.
- مسیرهای پرداخت/برداشت legacy به stubهای 410 تبدیل شدهاند و broadcast مالی توسط kill-switch سرورساز مسدود است.
- تمام routeهای ادمین قبل از خواندن بدنه، احراز هویت و مجوز سرورساز را بررسی میکنند.
- در live، بدون VRF/KYC تأییدشده، قرعهکشی و اقدامات حساس fail-closedاند.

---

## 2. جدول جامع وضعیت ردیفهای 1 تا 19

| # | اقدام | وضعیت فعلی | شواهد فنی/تستی | فایلهای کلیدی |
|---:|---|---|---|---|
| 1 | تأیید نهایی مالک بر مشخصات Phase 1A و معماری Phase 1B | `APPROVED` | تأیید صریح مالک در دستور اجرا ثبت شد | `docs/PHASE-1A-SPEC.md`, `docs/PHASE-1B-ARCHITECTURE.md` |
| 2 | بستن پارامترهای باقیمانده Phase 1A | `APPROVED` | تسلی پلهای، جکپات 50/30/20، Referral 2% post-settlement، Refund/Rollover 72h و آستانه KYC در تستها پین شدند | `src/lib/rewardEngine.ts`, `src/lib/vaultAccounts.ts`, `src/lib/refundRollover.ts`, `src/lib/kycProvider.ts` |
| 3 | تأیید فهرست مناطق ممنوعه و سن قانونی | `APPROVED — BASE LIST` | +18 سرورساز و لیست پیشفرض `US,KP,IR,SY,CU,RU,BY,MM,AF` اعمال شد | `src/lib/complianceGuard.ts`, `src/lib/phase2Policy.ts`, `tests/phase2-controls.test.mjs` |
| 4 | انتخاب ارائهدهنده KYC و VRF | `APPROVED — MODULAR INTERFACE` | interface ماژولار و fail-closed در live نهایی شد؛ vendor نهایی باقی است | `src/lib/kycProvider.ts`, `src/lib/drawRandomness.ts`, `src/lib/phase2Policy.ts` |
| 5 | فریز هش MAIN/WORKSPACE و تهیه بکاپ | `COMPLETED (SNAPSHOT)` | اسنپشات بدون `.git`/`node_modules`؛ تست row 18 PASS | `F:\betx-lottery-main1\PRE-PHASE2-SNAPSHOT`, `tests/phase2-controls.test.mjs` |
| 6 | ایجاد شاخه integration از مرجع | `COMPLETED` | `feat/phase2-architecture` از `2178d6af...`؛ `main` تغییری نکرد | Git refs, `docs/PHASE-1B-ARCHITECTURE.md` |
| 7 | اجرای M1–M9 روی دیتابیس ایزوله | `IMPLEMENTED — DB RUN PASS` | دو بار اعمال فوروارد-only و idempotent؛ 18/18 PASS روی `betx_phase2_test` | `supabase/migrations/20261126_m1_*` تا `m9_*`, `BETX-PHASE2-ISOLATED-DB-REPORT.txt` |
| 8 | تست parity Drizzle / Supabase | `STATIC + DB PARITY PASS` | 37 جدول Drizzle در برابر 37 جدول DB؛ بدون جدول/ستونmissing یا extra | `src/db/schema.ts`, `supabase/schema.sql`, `tests/phase1b-schema-parity.test.mjs` |
| 9 | پیادهسازیpure `/api/state` و حذف traffic trigger | `COMPLETED` | تست purity و عدم راهاندازی automation PASS | `src/app/api/state/route.ts`, `src/lib/store.ts`, `tests/phase1b-schema-parity.test.mjs` |
| 10 | RBAC، operatorها و audit hash-chain | `IMPLEMENTED — WIRED` | تستهای RBAC، attribution و 13 route ادمین PASS | `src/lib/admin.ts`, `src/lib/adminRbac.ts`, `src/lib/auditChain.ts`, `src/lib/phase2Runtime.ts`, `tests/phase6-admin.test.mjs` |
| 11 | Randomness VRF و سه برنده متمایز | `IMPLEMENTED — REPLAYABLE ADAPTER` | replay determinism، tamper rejection و winners distinct PASS؛ live fail-closed | `src/lib/drawRandomness.ts`, `src/lib/phase2Policy.ts`, `tests/phase2-controls.test.mjs` |
| 12 | Vault growth/reserve، referral و jackpot | `IMPLEMENTED — WIRED` | 80/20، Referral 2% و 50/30/20 PASS | `src/lib/vaultAccounts.ts`, `src/lib/rewardEngine.ts`, `src/lib/phase2Policy.ts` |
| 13 | Refund / Rollover 72 ساعت | `IMPLEMENTED — WIRED` | reconcile 100% و قاعده 72h همان tier PASS | `src/lib/refundRollover.ts`, `src/lib/store.ts`, `src/lib/automation.ts` |
| 14 | Compliance guard سرورساز | `IMPLEMENTED — KYC ADAPTER` | سن، geo، KYC threshold و live fail-closed PASS | `src/lib/complianceGuard.ts`, `src/lib/kycProvider.ts`, `src/lib/phase2Policy.ts` |
| 15 | Integrity proof و readiness gate | `IMPLEMENTED — WIRED` | proof نامعتبر و موارد پرچمگذاریشده fail-closedاند | `src/lib/integrityProof.ts`, `src/lib/readinessGate.ts`, `src/app/api/health/route.ts` |
| 16 | بررسی تراکنشها، فرایندها و اسکریپتها | `IMPLEMENTED — VERIFIED` | health/readiness، reconciliation proof و اسکریپتهای ساخت PASS | `src/lib/phase2Runtime.ts`, `src/app/api/health/route.ts`, `scripts/build-sw.cjs` |
| 17 | بررسی امنیتی مستقل و replay حوادث | `IMPLEMENTED — ADAPTERS + ACTOR BOUND` | SEC-01 تا SEC-14 همگی PASS؛ replay حوادث پوشش داده شد | `src/lib/phase2SecurityAudit.ts`, `tests/phase2-controls.test.mjs`, `tests/phase6-admin.test.mjs` |
| 18 | تمرین backup/restore و rollback | `COMPLETED — RESTORE VERIFIED` | 7 فایل با هش برابرRestore شدند؛ مسیر rollback مستند و اجرانشده | `F:\betx-lottery-main1\PRE-PHASE2-SNAPSHOT`, `docs/PHASE-1B-ARCHITECTURE.md` |
| 19 | تصمیم Go / No-Go مالک | `NO-GO / PENDING OWNER DECISION` | readiness gate تا GO مالک blocker دارد؛ هیچ commit/merge و هیچ تغییر maintenance/live/payments انجام نشد | `src/lib/phase2Policy.ts`, `src/lib/readinessGate.ts`, `docs/PHASE-1B-ARCHITECTURE.md` |

---

## 3. خلاصه نتایج راستیآزمایی و تستها

### 3.1 دیتابیس ایزوله و parity

- دیتابیس: `betx_phase2_test`، فقط از طریق `BETX_TEST_DATABASE_URL` محلی و موقتی.
- `DATABASE_URL` main/live unset باقی ماند؛ هیچ `.env` خوانده یا کپی نشد.
- `supabase/schema.sql` یک بار PASS شد.
- M1 تا M9 دو بار با `ON_ERROR_STOP=1` اعمال شدند: **18/18 PASS** و فقط NOTICEهای مربوط به `already exists` مشاهده شد.
- parity کاتالوگ: `drizzleTables: 37`، `databaseTables: 37`، `missingTables: []`، `extraTables: []`، `missingColumns: []`، `extraColumns: []`، `ok: true`.
- تست constraintهای PostgreSQL، preflight migration و reservation همزمان در محیط ایزوله PASS شد.

### 3.2 یافتههای امنیتی SEC-01 تا SEC-14

| شناسه | حوزه | نتیجه |
|---|---|---|
| SEC-01 | admin-authorization | PASS |
| SEC-02 | audit-chain | PASS |
| SEC-03 | health-readiness | PASS |
| SEC-04 | reconciliation-proof | PASS |
| SEC-05 | sensitive-compliance | PASS |
| SEC-06 | payment-guard | PASS |
| SEC-07 | state-isolation | PASS |
| SEC-08 | live-vrf-fail-closed | PASS |
| SEC-09 | compliance-policy | PASS |
| SEC-10 | financial-broadcast | PASS |
| SEC-11 | fail-closed-defaults | PASS |
| SEC-12 | kyc-provider-adapter | PASS |
| SEC-13 | vrf-replayable-adapter | PASS |
| SEC-14 | admin-actor-binding | PASS |

### 3.3 ریسکهای باقیمانده

| شناسه | وضعیت | توضیح |
|---|---|---|
| RISK-DB-ISOLATION | `RESOLVED — ISOLATED DB PASS` | M1–M9 و parity 37/37 روی دیتابیس ایزوله PASS |
| RISK-VRF-VENDOR | `MITIGATED — REPLAYABLE ADAPTER / LIVE FAIL-CLOSED` | آداپتور replayable موجود است؛ ارائهدهنده واقعی هنوز نیازمند اتصال است |
| RISK-KYC-VENDOR | `MITIGATED — SIMULATED ADAPTER / LIVE FAIL-CLOSED` | آداپتور شبیهسازی موجود است؛ ارائهدهنده واقعی هنوز نیازمند اتصال است |
| RISK-AUDIT-ACTOR | `RESOLVED — OPERATOR-BOUND` | fingerprint توکن operator/session در زنجیره ممیزی ثبت میشود |
| RISK-CONDITIONAL-ERRORS | `PARTIAL — DB PASS / TLS SKIPPED` | مسیر TLS ایزOLED هنوز bootstrap نشده |
| RISK-OWNER-DECISION | `OPEN — PENDING OWNER DECISION` | ردیف 19 هنوز GO نشده است |

### 3.4 ابزارهای کنترل کیفیت

| ابزار | نتیجه نهایی |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 68 tests / 66 pass / 0 fail / 0 cancelled / 2 skipped / 0 todo |
| `npm run build` | PASS — Next.js compile، TypeScript و 7 صفحه استاتیک موفق؛ service worker `QcTKBUQukeGoCA6zy42qI` |

دو تست skipped عبارتاند از:

- `Set BETX_TEST_DATABASE_URL to an isolated localhost betx_*test database.`
- `Requires the isolated local PostgreSQL TLS test harness.`

تست PostgreSQL ایزوله قبلاً در محیط جداگانه PASS شد؛ تست TLS بهدلیل نبود harness اجرا نشد.

### 3.5 وضعیت رابط کاربری و چندزبانه

- 7 کارت سطح بلیت $1 تا $200، جوایز سه نفره، ظرفیت زنده، تقسیم 75/15/10 و 80/12/8، تضمین 72h و نشان KYC Tier 6/7 اضافه شد.
- پنل شفافیت شامل مقایسه، وضعیت Vault، هش قرعهکشی و شمارش معکوس 72h اضافه شد.
- جکپات هفتگی 50/30/20، Referral 2% post-settlement وconsolation گردونه $0.05–$1.00 اضافه شد.
- کلیدها در 6 زبان انگلیسی، فارسی، اسپانیایی، عربی، ترکی و روسی هماهنگ شدند.
- دکمههای خرید/واریز/برداشت در maintenance پیام واضح نشان میدهند و درخواست مالی ارسال نمیکنند.

---

## 4. چکلیست پیشنیازهای صدور تصمیم `GO` نهایی توسط مالک

تمام موارد زیر آیندهاند و در این مرحله **انجام نشدهاند**:

1. **تصمیم صریح مالک**: تغییر ردیف 19 از `NO-GO / PENDING OWNER DECISION` به `GO` تنها با دستور صریح مالک.
2. **اتصال VRF واقعی**: انتخاب و اتصال ارائهدهنده نهایی، تأیید proof، جایگزینی fail-closed و قراردادن `vrfProviderReady=true`.
3. **اتصال KYC واقعی**: اتصال ارائهدهنده نهایی، پوشش آستانه $500، Tier 6/7 و تحریمها، و قراردادن `kycProviderReady=true`.
4. **تست TLS ایزوله**: راهاندازی harness محلی `BETX_TEST_TLS_DATABASE_URL`، CA معتبر و CA نامعتبر؛ تبدیل `RISK-CONDITIONAL-ERRORS` به `RESOLVED`.
5. **اعمال migration در محیط هدف**: تنها پس از تأیید مالک و با نگهداری `DATABASE_URL` live در حالت unset تا زمان مجوز؛ قراردادن `dbMigrationsApplied=true` در محیط مجاز.
6. **commit و ادغام کنترلشده**: ثبت وضعیت و HEAD، بررسی diff، commit تغییرات روی `feat/phase2-architecture` و سپس merge به `main` تنها با تأیید مالک؛ بدون deploy خودکار.
7. **برداشت گامبهگام قفلها**: ابتدا `MAINTENANCE_MODE` را تنها پس از GO و بررسی health/readiness برداشتن؛ سپس `paymentsEnabled=true` تحت نظارت؛ سپس `liveMode=true` بهعنوان آخرین گام.
8. **پایشpost-GO**: تأیید audit chain، readiness، reconciliation proof و عدم وجود blocker قبل از هر اقدام مالی یا تغییر تنظیمات.

**قانون خروج:** تا زمانی که ردیف 19 دقیقاً `GO` نشده و VRF/KYC واقعی، TLS ایزوله و مراحل بالا تکمیل نشدهاند، disabling maintenance، payments، payouts یا live mode ممنوع است.

---

## 5. بایگانی

این سند وضعیت نهایی مرحله Phase 2 را بهعنوان مرجع بایگانی ثبت میکند. هیچ کدی در `src/`، `supabase/` یا `tests/` توسط این گام تغییر نکرد. `main`، `WORKSPACE`، `MAINTENANCE_MODE`، پرداخت، برداشت و حالت live دستنخورده باقی ماندند.
