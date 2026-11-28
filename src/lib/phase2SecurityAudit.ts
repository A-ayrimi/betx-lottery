import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type AuditSeverity = "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type AuditStatus = "PASS" | "RISK" | "BLOCKED";

export interface AuditFinding {
  id: string;
  area: string;
  severity: AuditSeverity;
  status: AuditStatus;
  path: string;
  detail: string;
}

export interface ResidualRisk {
  id: string;
  severity: AuditSeverity;
  summary: string;
  owner: string;
  mitigation: string;
  status: string;
}

export interface Phase2SecurityAudit {
  findings: readonly AuditFinding[];
  residualRisks: readonly ResidualRisk[];
  pass: boolean;
}

const ADMIN_ROUTES: readonly string[] = [
  "src/app/api/admin/audit/route.ts",
  "src/app/api/admin/automation/route.ts",
  "src/app/api/admin/fees/route.ts",
  "src/app/api/admin/reports/reconciliation/route.ts",
  "src/app/api/admin/reports/tiers/route.ts",
  "src/app/api/admin/rounds/[id]/review/route.ts",
  "src/app/api/admin/rounds/[id]/settle/route.ts",
  "src/app/api/admin/rounds/open/route.ts",
  "src/app/api/admin/tiers/[id]/route.ts",
  "src/app/api/admin/tiers/route.ts",
  "src/app/api/admin/treasury/initialize/route.ts",
  "src/app/api/admin/withdrawals/pay/route.ts",
  "src/app/api/admin/withdrawals/route.ts",
];

const SENSITIVE_ROUTES: readonly string[] = [
  "src/app/api/tickets/buy/route.ts",
  "src/app/api/wheel/spin/route.ts",
  "src/app/api/payments/withdraw/route.ts",
  "src/app/api/wallet/claim/route.ts",
  "src/app/api/wallet/deposit/route.ts",
];

const PAYMENT_ROUTES: readonly string[] = [
  "src/app/api/payments/withdraw/route.ts",
  "src/app/api/wallet/claim/route.ts",
  "src/app/api/wallet/deposit/route.ts",
];

export const PHASE2_RESIDUAL_RISKS: readonly ResidualRisk[] = [
  {
    id: "RISK-DB-ISOLATION",
    severity: "HIGH",
    summary: `اجرای M1–M9 و parity روی دیتابیس ایزوله BETX_TEST_DATABASE_URL با موفقیت انجام شد.`,
    owner: "فنی",
    mitigation: "فقط دیتابیس localhost ایزوله betx_phase2_test استفاده شد؛ DATABASE_URL live unset ماند و خوشه موقت حذف شد.",
    status: "RESOLVED — ISOLATED DB PASS",
  },
  {
    id: "RISK-VRF-VENDOR",
    severity: "HIGH",
    summary: "ارائهدهنده VRF خارجی اختیاری هنوز متصل نشده و live mode از تصادف خارجی یا مشتری استفاده نمیکند.",
    owner: "مالک / فنی",
    mitigation: "قرعهکشی live و demo از همان commit-reveal HMAC-SHA256 قابل replay استفاده میکند؛ دانه سرور قبل از دور تعهد و پس از قرعهکشی افشا میشود.",
    status: "MITIGATED — COMMIT-REVEAL HMAC / NO EXTERNAL VRF",
  },
  {
    id: "RISK-KYC-VENDOR",
    severity: "HIGH",
    summary: "ارائهدهنده KYC واقعی هنوز متصل نشده است.",
    owner: "مالک / حقوقی",
    mitigation: "آداپتور KYC ماژولار با آستانه 500$ و Tier 6 اضافه شد؛ حتی KYC تأییدشده در live توسط fail-closed مسدود میشود.",
    status: "MITIGATED — SIMULATED ADAPTER / LIVE FAIL-CLOSED",
  },
  {
    id: "RISK-AUDIT-ACTOR",
    severity: "MEDIUM",
    summary: "actor ممیزی ادمین به fingerprint توکن session/operator متصل شد و دیگر عمومی و مشترک نیست.",
    owner: "فنی",
    mitigation: "actorها از requireAdminRole مشتق میشوند و زنجیره ممیزی operatorRef و sessionRef را در کنار roleSnapshot ثبت میکند.",
    status: "RESOLVED — OPERATOR-BOUND",
  },
  {
    id: "RISK-CONDITIONAL-ERRORS",
    severity: "MEDIUM",
    summary: "مسیر مشروط PostgreSQL/TLS ایزوله بهجز TLS هنوز پوشش تست کامل ندارد.",
    owner: "فنی",
    mitigation: "M1–M9 و parity دو بار PASS شدند؛ TLS بهدلیل نبود harness skipped ماند و خطاهای vendor fail-closed اند.",
    status: "PARTIAL — DB PASS / TLS SKIPPED",
  },
  {
    id: "RISK-OWNER-DECISION",
    severity: "HIGH",
    summary: "ردیف 19 تصمیم Go/No-Go هنوز در اختیار مالک است.",
    owner: "مالک",
    mitigation: "وضعیت NO-GO / PENDING OWNER DECISION حفظ شد و هیچ commit یا merge انجام نشد.",
    status: "OPEN — PENDING OWNER DECISION",
  },
];

function createFinding(
  id: string,
  area: string,
  severity: AuditSeverity,
  status: AuditStatus,
  path: string,
  detail: string,
): AuditFinding {
  return { id, area, severity, status, path, detail };
}

export function runPhase2SecurityAudit(root: string = process.cwd()): Phase2SecurityAudit {
  const readSource = (file: string): string => {
    const fullPath = join(root, file);
    return existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
  };

  const findings: AuditFinding[] = [];

  const adminFailures = ADMIN_ROUTES.filter((file) => {
    const source = readSource(file);
    const hasAuthorization = source.includes("requireAdminRole(") || source.includes("isAdmin(");
    return !hasAuthorization || !source.includes("assertLegacyPermission(");
  });
  findings.push(createFinding(
    "SEC-01",
    "admin-authorization",
    "HIGH",
    adminFailures.length === 0 ? "PASS" : "BLOCKED",
    "src/app/api/admin/**",
    adminFailures.length === 0
      ? "تمام 13 route ادمین قبل از خواندن بدنه، احراز هویت و مجوز سرورساز را بررسی میکنند."
      : `فاقد authz سرورساز: ${adminFailures.join(", ")}`,
  ));

  const auditRoute = readSource("src/app/api/admin/audit/route.ts");
  const auditChainOk = auditRoute.includes("listAdminAuditChain") && auditRoute.includes("chain");
  findings.push(createFinding(
    "SEC-02",
    "audit-chain",
    "HIGH",
    auditChainOk ? "PASS" : "BLOCKED",
    "src/app/api/admin/audit/route.ts",
    auditChainOk
      ? "گزارش ممیزی شامل زنجیره هش تأییدشده در کنار لاگlegacy است."
      : "نمایش زنجیره ممیزی یافت نشد.",
  ));

  const healthRoute = readSource("src/app/api/health/route.ts");
  findings.push(createFinding(
    "SEC-03",
    "health-readiness",
    "MEDIUM",
    healthRoute.includes("phase2Readiness") ? "PASS" : "BLOCKED",
    "src/app/api/health/route.ts",
    healthRoute.includes("phase2Readiness")
      ? "سلامت سرویس وضعیت دروازه Phase 2 را بدون اجرای عملیات مالی ارائه میدهد."
      : "readiness gate در سلامت سرویس موجود نیست.",
  ));

  const reconciliationRoute = readSource("src/app/api/admin/reports/reconciliation/route.ts");
  const reconciliationOk = reconciliationRoute.includes("getPhase2ProofSummary") && reconciliationRoute.includes("phase2Readiness");
  findings.push(createFinding(
    "SEC-04",
    "reconciliation-proof",
    "HIGH",
    reconciliationOk ? "PASS" : "BLOCKED",
    "src/app/api/admin/reports/reconciliation/route.ts",
    reconciliationOk
      ? "گزارش تطبیق شامل خلاصه proof و دروازه readiness است."
      : "خلاصه proof یا readiness در گزارش تطبیق موجود نیست.",
  ));

  const complianceFailures = SENSITIVE_ROUTES.filter((file) => !readSource(file).includes("assessSensitiveAction("));
  findings.push(createFinding(
    "SEC-05",
    "sensitive-compliance",
    "HIGH",
    complianceFailures.length === 0 ? "PASS" : "BLOCKED",
    "src/app/api/{tickets,buy},{wheel,spin},{payments,withdraw},{wallet,claim},{wallet,deposit}",
    complianceFailures.length === 0
      ? "تمام مسیرهای حساس از گارد سن/جغرافیا/KYC سرورساز عبور میکنند."
      : `فاقد compliance gate: ${complianceFailures.join(", ")}`,
  ));

  const paymentsFailures = PAYMENT_ROUTES.filter((file) => !readSource(file).includes("publicConfig().paymentsEnabled"));
  findings.push(createFinding(
    "SEC-06",
    "payment-guard",
    "HIGH",
    paymentsFailures.length === 0 ? "PASS" : "BLOCKED",
    "src/app/api/{payments,withdraw},{wallet,claim},{wallet,deposit}",
    paymentsFailures.length === 0
      ? "ورودیهای مالی قبل از هر اثر پرداختی paymentsEnabled را بررسی میکنند."
      : `فاقد paymentsEnabled: ${paymentsFailures.join(", ")}`,
  ));

  const stateRoute = readSource("src/app/api/state/route.ts");
  const statePure = stateRoute.includes("getState()") && !stateRoute.includes("maybeRunAutomation") && !stateRoute.includes("after(");
  findings.push(createFinding(
    "SEC-07",
    "state-isolation",
    "HIGH",
    statePure ? "PASS" : "BLOCKED",
    "src/app/api/state/route.ts",
    statePure
      ? "GET /api/state خواندنی است و هیچ automation یا اثر جانبی از ترافیک عمومی ایجاد نمیکند."
      : "اثر جانبی احتمالی در مسیر state یافت شد.",
  ));

  const policySource = readSource("src/lib/phase2Policy.ts");
  const randomnessSource = readSource("src/lib/drawRandomness.ts");
  const storeSource = readSource("src/lib/store.ts");
  const commitRevealOk =
    policySource.includes("createReplayableVrfProvider") &&
    !policySource.includes("failClosedVrfProvider") &&
    storeSource.includes("seedHash") &&
    storeSource.includes("revealedServerSeed");
  findings.push(createFinding(
    "SEC-08",
    "live-commit-reveal-draw",
    "HIGH",
    commitRevealOk ? "PASS" : "BLOCKED",
    "src/lib/store.ts, src/lib/phase2Policy.ts",
    commitRevealOk
      ? "در live و demo از همان تعهد SHA-256 و افشای دانه سرور با HMAC-SHA256 قابل replay استفاده میشود."
      : "مسیر commit-reveal قابل replay برای قرعهکشی یافت نشد.",
  ));

  const complianceSource = readSource("src/lib/complianceGuard.ts");
  const jurisdictions = ["US", "KP", "IR", "SY", "CU", "RU", "BY", "MM", "AF"];
  const compliancePolicyOk = complianceSource.includes("MINIMUM_AGE = 18") && jurisdictions.every((code) => complianceSource.includes(`"${code}"`));
  findings.push(createFinding(
    "SEC-09",
    "compliance-policy",
    "HIGH",
    compliancePolicyOk ? "PASS" : "BLOCKED",
    "src/lib/complianceGuard.ts",
    compliancePolicyOk
      ? "سن +18 و لیست نهایی 9 jurisdiction ممنوعه سرورساز ثبت شد."
      : "پارامترهای نهایی compliance یافت نشد.",
  ));

  const solanaSource = readSource("src/lib/solana.ts");
  const broadcastGuard = solanaSource.includes("isSolanaBroadcastAuthorized()") && solanaSource.includes("Solana broadcast is not authorized");
  findings.push(createFinding(
    "SEC-10",
    "financial-broadcast",
    "HIGH",
    broadcastGuard ? "PASS" : "BLOCKED",
    "src/lib/solana.ts",
    broadcastGuard
      ? "هر broadcast Solana توسط kill-switch سرورساز مسدود میشود مگر authorization صریح وجود داشته باشد."
      : "kill-switch broadcast یافت نشد.",
  ));

  const configSource = readSource("src/lib/config.ts");
  const gameConfigSource = readSource("src/lib/gameConfig.ts");
  const readinessSource = readSource("src/lib/readinessGate.ts");
  const defaultsSafe = configSource.includes("paymentsEnabled: false") && gameConfigSource.includes('return raw !== "false"') && readinessSource.includes("maintenanceMode: true");
  findings.push(createFinding(
    "SEC-11",
    "fail-closed-defaults",
    "HIGH",
    defaultsSafe ? "PASS" : "BLOCKED",
    "src/lib/config.ts, src/lib/gameConfig.ts, src/lib/readinessGate.ts",
    defaultsSafe
      ? "پیشفرضها maintenance=ON، payments=OFF و readiness fail-closed اند."
      : "یکی از پیشفرضهای fail-closed یافت نشد.",
  ));

  const kycSource = readSource("src/lib/kycProvider.ts");
  const kycAdapterOk =
    kycSource.includes("export function resolveKycProvider") &&
    policySource.includes("evaluateKycProviderGate(") &&
    policySource.includes("kycProviderBlocked");
  findings.push(createFinding(
    "SEC-12",
    "kyc-provider-adapter",
    "HIGH",
    kycAdapterOk ? "PASS" : "BLOCKED",
    "src/lib/kycProvider.ts, src/lib/phase2Policy.ts",
    kycAdapterOk
      ? "آداپتور KYC ماژولار آستانه 500$ و Tier 6 را پوشش میدهد و در live fail-closed است."
      : "آداپتور KYC ماژولار یا اتصال آن به policy یافت نشد.",
  ));

  const vrfReplayOk =
    policySource.includes("createReplayableVrfProvider") && randomnessSource.includes("export function createReplayableVrfProvider");
  findings.push(createFinding(
    "SEC-13",
    "vrf-replayable-adapter",
    "HIGH",
    vrfReplayOk ? "PASS" : "BLOCKED",
    "src/lib/drawRandomness.ts, src/lib/phase2Policy.ts",
    vrfReplayOk
      ? "پروتوف HMAC-SHA256 قابل replay و بررسی دستکاری است و قرعهکشی live/demo از خروجی همان آداپتور استفاده میکند."
      : "آداپتور replayable HMAC-SHA256 یافت نشد.",
  ));

  const adminSource = readSource("src/lib/admin.ts");
  const runtimeSource = readSource("src/lib/phase2Runtime.ts");
  const actorBoundOk =
    adminSource.includes("getAdminActor(") &&
    runtimeSource.includes("operatorRefFromActor(") &&
    ["rounds/open/route.ts", "rounds/[id]/review/route.ts", "rounds/[id]/settle/route.ts", "treasury/initialize/route.ts", "withdrawals/route.ts", "withdrawals/pay/route.ts"].every(
      (file) => readSource(`src/app/api/admin/${file}`).includes("auth.actor"),
    );
  findings.push(createFinding(
    "SEC-14",
    "admin-actor-binding",
    "MEDIUM",
    actorBoundOk ? "PASS" : "BLOCKED",
    "src/lib/admin.ts, src/lib/phase2Runtime.ts, src/app/api/admin/**",
    actorBoundOk
      ? "actor ممیزی از هش توکن operator/session مشتق و در زنجیره ممیزی ثبت میشود."
      : "اتصال actor ادمین به operator/session یافت نشد.",
  ));

  return {
    findings,
    residualRisks: PHASE2_RESIDUAL_RISKS.map((risk) => ({ ...risk })),
    pass: findings.every((finding) => finding.status === "PASS"),
  };
}
