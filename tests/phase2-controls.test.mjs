import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluateAdminSession, resolveLegacyAdminRole, roleHasPermission, verifyAdminTokenHash, hashAdminToken } from "../src/lib/adminRbac.ts";
import { auditHead, nextAuditEvent, verifyAuditChain } from "../src/lib/auditChain.ts";
import { drawDistinctWinners, failClosedVrfProvider, randomBelow, createVrfProvider, createReplayableVrfProvider, hashTicketSnapshot } from "../src/lib/drawRandomness.ts";
import { allocateVault, computeReferralCommission, validateVaultLedger } from "../src/lib/vaultAccounts.ts";
import { consolationProbabilityTotal, drawConsolationReward, validateJackpotSplit, weeklyJackpotSplit } from "../src/lib/rewardEngine.ts";
import { buildRefundEntry, buildRolloverEntry, evaluateRefundEligibility } from "../src/lib/refundRollover.ts";
import { evaluateCompliance, isGeoEnforcementRequired, readCountryFromHeaders } from "../src/lib/complianceGuard.ts";
import { createSimulatedKycProvider, resolveKycProvider } from "../src/lib/kycProvider.ts";
import { buildIntegrityProof, evaluateIntegrityInvariants, verifyIntegrityProof } from "../src/lib/integrityProof.ts";
import { evaluateReadinessGate, isPassingStatus } from "../src/lib/readinessGate.ts";
import {
  PHASE2_CHECKLIST_ROWS,
  assertLegacyPermission,
  assessSensitiveAction,
  buildPhase2SettlementPlan,
  derivePhase2Draw,
  phase2Readiness,
} from "../src/lib/phase2Policy.ts";
import { PHASE2_RESIDUAL_RISKS, runPhase2SecurityAudit } from "../src/lib/phase2SecurityAudit.ts";
import { isPreviewAppState } from "../src/lib/demoSession.ts";
import { previewVaultCandles, previewVaultPayload } from "../src/lib/previewCandles.ts";
import { isNonLivePreview, previewProgress, previewRoundState, previewState, previewTicketBySerial } from "../src/lib/previewFallback.ts";
import {
  PHASE2_BASELINE_HEAD,
  PHASE2_DATABASE_RECOVERY_CHECKLIST,
  PHASE2_RECOVERY_STEPS,
  resolvePhase2SnapshotRoot,
  verifyPhase2Snapshot,
} from "../src/lib/phase2Recovery.ts";

test("Phase 2 row 10: admin RBAC and audit chain are fail-closed", async () => {
  assert.equal(resolveLegacyAdminRole("secret", "secret"), "owner");
  assert.equal(resolveLegacyAdminRole("secret", "other"), null);
  assert.equal(roleHasPermission("auditor", "rounds:draw"), false);
  assert.equal(roleHasPermission("operator", "rounds:draw"), true);
  assert.equal(evaluateAdminSession({ role: "owner", expiresAt: Date.now() - 1 }).reason, "expired");
  assert.equal(evaluateAdminSession({ role: "auditor", expiresAt: Date.now() + 10000 }).valid, true);

  const tokenHash = await hashAdminToken("token", "salt");
  assert.equal(await verifyAdminTokenHash("token", "salt", tokenHash), true);

  const first = await nextAuditEvent({ eventType: "admin", actor: "owner", action: "login", subject: "admin" }, undefined);
  const second = await nextAuditEvent({ eventType: "draw", actor: "operator", action: "draw", subject: "round-1" }, first.hash);
  assert.equal(await verifyAuditChain([first, second]), true);
  assert.equal(auditHead([first, second]), second.hash);
  assert.equal(await verifyAuditChain([first, { ...second, subject: "round-2" }]), false);
});

test("Phase 2 row 11: VRF proof is verified and winners are distinct", async () => {
  const proof = {
    providerId: "test-vrf",
    roundId: "round-1",
    seed: "seed",
    nonce: "nonce",
    signature: "signature",
    publicKey: "public-key",
    ticketSnapshotHash: await hashTicketSnapshot([
      { id: "t1", userId: "u1", tier: 1 },
      { id: "t2", userId: "u2", tier: 1 },
      { id: "t3", userId: "u3", tier: 1 },
    ]),
  };
  const provider = createVrfProvider({
    id: "test-vrf",
    verify: async () => true,
    randomBytes: async (_candidate, index) => new Uint8Array([1, 2, index + 3]),
  });
  const winners = await drawDistinctWinners(provider, proof, 10, 1);
  assert.equal(winners.length, 1);
  assert.equal(new Set(winners).size, 1);
  assert.equal(randomBelow(10, new Uint8Array([255, 255])), null);
  await assert.rejects(() => drawDistinctWinners(failClosedVrfProvider, { ...proof, providerId: "fail-closed" }, 10, 1));
});

test("Phase 2 VRF adapter: replay is deterministic and tampering is rejected", async () => {
  const provider = createReplayableVrfProvider({ id: "replayable-test-v1", secret: "replay-secret" });
  const proof = await provider.issueProof({ roundId: "round-replay", seed: "replay-secret", ticketSnapshotHash: "snapshot" });
  assert.equal(proof.algorithm, "HMAC-SHA256-REPLAY-v1");
  assert.equal(await provider.replay?.(proof), true);
  assert.deepEqual(
    await drawDistinctWinners(provider, proof, 8, 1),
    await drawDistinctWinners(provider, proof, 8, 1),
  );
  await assert.rejects(() => drawDistinctWinners(provider, { ...proof, signature: "tampered" }, 8, 1));

  const tickets = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, userId: index + 1, serial: `R${index + 1}`, tierId: 1 }));
  const first = await derivePhase2Draw({ roundId: 9, serverSeed: "seed", tickets, live: false });
  const second = await derivePhase2Draw({ roundId: 9, serverSeed: "seed", tickets, live: false });
  assert.deepEqual(first.indices, second.indices);
  assert.equal(first.proofHash, second.proofHash);
});

test("Phase 2 KYC adapter: thresholds are enforced and live stays fail-closed", () => {
  const nowMs = Date.parse("2026-01-01T00:00:00.000Z");
  const provider = createSimulatedKycProvider("test-kyc-v1");
  const tierSix = { status: "approved", tier: 6, nowMs };
  const highVolume = { status: "approved", lifetimeWithdrawalCents: 50001, nowMs };
  assert.equal(provider.check(tierSix).required, true);
  assert.equal(provider.check(tierSix).approved, true);
  assert.equal(provider.check({ ...tierSix, status: "pending" }).approved, false);
  assert.equal(provider.check({ ...tierSix, expiresAt: "2025-01-01T00:00:00.000Z" }).approved, false);
  assert.equal(provider.check(highVolume).required, true);
  assert.equal(provider.check({ ...highVolume, lifetimeWithdrawalCents: 50000 }).required, false);
  assert.equal(resolveKycProvider({ live: true, external: provider }).check(tierSix).approved, false);

  const liveDecision = assessSensitiveAction(
    {
      countryCode: "DE",
      birthDate: "1990-01-01",
      ageStatus: "VERIFIED",
      ageVerifiedAt: "2026-01-01",
      kycStatus: "APPROVED",
      kycLevel: "6",
      nowMs,
    },
    null,
    { LIVE_MODE: "true" },
  );
  assert.equal(liveDecision.kycProvider.mode, "fail-closed");
  assert.equal(liveDecision.kycProvider.approved, false);
  assert.equal(liveDecision.allowed, false);
  assert.equal(liveDecision.requiredActions.includes("connect-kyc-provider"), true);
});

test("Phase 2 row 12: vault, referral and reward splits match approved parameters", () => {
  assert.deepEqual(allocateVault(10000), { grossCents: 10000, growthCents: 8000, jackpotCents: 2000 });
  assert.equal(validateVaultLedger([{ id: "v1", roundId: "r1", grossCents: 10000, growthCents: 8000, jackpotCents: 2000 }]), true);
  assert.equal(computeReferralCommission({ grossCents: 10000, settled: false, directReferral: true, kycApproved: true, refunded: false }).amountCents, 0);
  assert.equal(computeReferralCommission({ grossCents: 10000, settled: true, directReferral: true, kycApproved: true, refunded: false }).amountCents, 200);
  assert.equal(consolationProbabilityTotal(), 10000);
  assert.equal(drawConsolationReward(0.99).prizeCents, 100);
  assert.deepEqual(weeklyJackpotSplit(1001), { winnerCents: 1001 });
  assert.equal(validateJackpotSplit({ winnerCents: 1001 }, 1001), true);
  assert.equal(validateJackpotSplit({ winnerCents: 1000 }, 1001), false);
});

test("Phase 2 row 13: refund and rollover follow the 72h same-tier rule", () => {
  const openedAt = 1000000;
  const pool = { tier: 2, openedAt };
  assert.equal(evaluateRefundEligibility(pool, openedAt + 1000), "pending");
  assert.equal(evaluateRefundEligibility(pool, openedAt + 72 * 60 * 60 * 1000), "eligible");
  assert.equal(evaluateRefundEligibility({ ...pool, settledAt: openedAt + 1000 }, openedAt + 72 * 60 * 60 * 1000), "settled");
  assert.equal(buildRefundEntry({ poolId: "r1", userId: "u1", amountCents: 500, nowMs: 0 }).amountCents, 500);
  assert.equal(buildRolloverEntry({ poolId: "r1", userId: "u1", fromTier: 2, toTier: 2, amountCents: 500, nowMs: 0 }).toTier, 2);
  assert.throws(() => buildRolloverEntry({ poolId: "r1", userId: "u1", fromTier: 2, toTier: 3, amountCents: 500, nowMs: 0 }));
});

test("Phase 2 row 14: compliance guard is server-side and fail-closed", () => {
  const nowMs = Date.parse("2026-01-01T00:00:00.000Z");
  assert.equal(readCountryFromHeaders({ "cf-ipcountry": "us" }), "US");
  assert.equal(evaluateCompliance({ countryCode: "US", age: 30, kycStatus: "approved", nowMs }).allowed, false);
  assert.equal(evaluateCompliance({ countryCode: "DE", birthDate: "2010-01-01", kycStatus: "approved", nowMs }).allowed, false);
  assert.equal(evaluateCompliance({ countryCode: "DE", birthDate: "1990-01-01", tier: 6, kycStatus: "none", nowMs }).allowed, false);
  assert.equal(evaluateCompliance({ countryCode: "DE", birthDate: "1990-01-01", lifetimeVolumeCents: 50001, kycStatus: "none", nowMs }).allowed, false);
  assert.equal(evaluateCompliance({ countryCode: "DE", birthDate: "1990-01-01", kycStatus: "approved", nowMs }).allowed, true);
  assert.equal(isGeoEnforcementRequired({ LIVE_MODE: "true", GEO_BLOCK: "off" }), true);
});

test("Phase 2 row 15: integrity proof and readiness gate are fail-closed", async () => {
  const proof = await buildIntegrityProof({
    roundId: "round-1",
    ticketSnapshotHash: "snapshot",
    drawProofHash: "draw",
    settlementHash: "settlement",
    vaultAllocationHash: "vault",
    auditHeadHash: "audit",
    stateVersion: 1,
  }, 0);
  assert.equal(await verifyIntegrityProof(proof), true);
  assert.equal(await verifyIntegrityProof({ ...proof, stateVersion: 2 }), false);
  assert.deepEqual(evaluateIntegrityInvariants({
    winnerCount: 1,
    distinctWinnerCount: 2,
    referralBeforeSettlement: true,
    growthCents: 800,
    jackpotCents: 200,
    grossCents: 1000,
    blockedGeoAllowed: false,
    maintenanceDisabled: false,
    paymentsEnabled: false,
  }), ["duplicate-winners", "referral-before-settlement", "maintenance-off", "payments-off"]);

  const rows = Array.from({ length: 18 }, (_, index) => ({ id: index + 1, status: index === 9 ? "IMPLEMENTED / DB RUN SKIPPED" : "APPROVED" }));
  rows.push({ id: 19, status: "GO" });
  assert.equal(isPassingStatus("IMPLEMENTED / DB RUN SKIPPED"), false);
  assert.equal(evaluateReadinessGate(rows).ready, false);
  const readyRows = rows.map((row) => (row.id === 10 ? { ...row, status: "IMPLEMENTED" } : row));
  assert.equal(evaluateReadinessGate(readyRows, {
    maintenanceMode: false,
    paymentsEnabled: true,
    liveMode: true,
    vrfProviderReady: true,
    kycProviderReady: true,
    dbMigrationsApplied: true,
  }).ready, true);
});

test("Phase 2 integration policy wires RBAC, compliance, draw and settlement controls", async () => {
  assert.equal(assertLegacyPermission("ADMIN", "rounds:settle"), true);
  assert.equal(assertLegacyPermission("VIEWER", "rounds:settle"), false);
  assert.equal(assertLegacyPermission("VIEWER", "audit:read"), true);

  const compliantUser = {
    countryCode: "CA",
    birthDate: "1990-01-01",
    ageStatus: "VERIFIED",
    ageVerifiedAt: "2026-01-01",
    kycStatus: "APPROVED",
    kycLevel: "6",
    totalDepositedUsd: 600,
  };
  assert.equal(assessSensitiveAction(compliantUser, null, {}).allowed, true);
  const geoBlocked = assessSensitiveAction({ ...compliantUser, countryCode: "US" }, null, { GEO_BLOCK: "on" });
  assert.equal(geoBlocked.allowed, false);
  assert.equal(geoBlocked.reasons.includes("geo-blocked"), true);
  const strictBlocked = assessSensitiveAction({ ...compliantUser, ageStatus: "UNVERIFIED" }, null, { LIVE_MODE: "true" });
  assert.equal(strictBlocked.allowed, false);
  assert.equal(strictBlocked.strict, true);

  const tickets = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    userId: index + 1,
    serial: `S${index + 1}`,
    tierId: 1,
  }));
  const draw = await derivePhase2Draw({ roundId: 1, serverSeed: "seed", tickets, live: false, winnerCount: 1 });
  assert.equal(draw.indices.length, 1);
  assert.equal(new Set(draw.indices).size, 1);
  const liveDraw = await derivePhase2Draw({ roundId: 1, serverSeed: "seed", tickets, live: true, winnerCount: 1 });
  assert.deepEqual(liveDraw.indices, draw.indices);
  assert.equal(liveDraw.proofHash, draw.proofHash);
  const policySource = await readFile(new URL("../src/lib/phase2Policy.ts", import.meta.url), "utf8");
  assert.doesNotMatch(policySource, /failClosedVrfProvider/);
  assert.match(policySource, /createReplayableVrfProvider/);

  const plan = buildPhase2SettlementPlan({
    grossUsd: 1000,
    ticketCount: 100,
    settled: true,
    directReferral: true,
    kycApproved: true,
    refunded: false,
  });
  assert.equal(plan.vault.growthCents, 80000);
  assert.equal(plan.vault.jackpotCents, 20000);
  assert.equal(plan.referral.amountCents, 2000);
  assert.equal(plan.referral.payable, true);
  assert.equal(phase2Readiness().ready, false);
  assert.equal(PHASE2_CHECKLIST_ROWS.find((row) => row.id === 16)?.status, "IMPLEMENTED — VERIFIED");
});

test("Phase 2 row 17: independent static security audit passes with residual risks logged", () => {
  const audit = runPhase2SecurityAudit(process.cwd());
  assert.equal(audit.pass, true);
  assert.equal(audit.findings.length >= 14, true);
  assert.equal(audit.findings.every((finding) => finding.status === "PASS"), true);
  assert.equal(audit.residualRisks.some((risk) => risk.id === "RISK-DB-ISOLATION" && risk.status.includes("PASS")), true);
  assert.equal(audit.residualRisks.some((risk) => risk.id === "RISK-AUDIT-ACTOR" && risk.status.includes("RESOLVED")), true);
  assert.equal(audit.residualRisks.some((risk) => risk.id === "RISK-CONDITIONAL-ERRORS"), true);
  assert.equal(audit.residualRisks.some((risk) => risk.id === "RISK-OWNER-DECISION"), true);
  assert.equal(PHASE2_RESIDUAL_RISKS.length >= 6, true);
});

test("Phase 2 row 18: pre-Phase-2 snapshot is restorable and rollback plan is documented", () => {
  const snapshot = verifyPhase2Snapshot(resolvePhase2SnapshotRoot(process.cwd()));
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.head, PHASE2_BASELINE_HEAD);
  assert.equal(snapshot.branch, "main");
  assert.equal(snapshot.staged, "0");
  assert.equal(snapshot.missingFiles.length, 0);
  assert.equal(snapshot.forbiddenEntries.length, 0);
  assert.equal(PHASE2_RECOVERY_STEPS.some((step) => step.command.includes("git switch main")), true);
  assert.equal(PHASE2_RECOVERY_STEPS.every((step) => step.touchesLive === false), true);
  assert.equal(PHASE2_DATABASE_RECOVERY_CHECKLIST.some((check) => check.item.includes("BETX_TEST_DATABASE_URL")), true);
  assert.equal(PHASE2_CHECKLIST_ROWS.find((row) => row.id === 19)?.status, "NO-GO / PENDING OWNER DECISION");
});

test("non-live preview supplies complete tier, pool and candle data", () => {
  const previousMode = process.env.BETX_MODE;
  process.env.BETX_MODE = "demo";
  try {
    assert.equal(isNonLivePreview(), true);

    const fixedNow = Date.UTC(2026, 0, 1, 0, 0, 0);
    assert.deepEqual(previewState(fixedNow), previewState(fixedNow));
    assert.deepEqual(previewProgress(fixedNow), previewProgress(fixedNow));
    assert.deepEqual(previewVaultCandles("24h", fixedNow), previewVaultCandles("24h", fixedNow));
    assert.deepEqual(previewRoundState("gold_25", fixedNow), previewRoundState("gold_25", fixedNow));
    assert.equal(previewState(fixedNow).round?.closesAt, new Date(fixedNow + 72 * 3600_000).toISOString());
    assert.equal(previewVaultPayload("24h", fixedNow).updatedAt, new Date(fixedNow).toISOString());

    const state = previewState();
    assert.equal(state.config.live, false);
    assert.equal(state.config.paymentsEnabled, false);
    assert.equal(state.tiers.length, 7);
    assert.equal(isPreviewAppState(state), true);
    assert.ok(state.candles.length > 0);
    assert.equal(previewTicketBySerial(state.round.tickets[0].serial)?.serial, state.round.tickets[0].serial);

    for (const tier of state.tiers) {
      assert.ok(tier.code && tier.name);
      assert.ok(Number.isFinite(tier.priceUsd) && tier.priceUsd > 0);
      assert.ok(Number.isFinite(tier.capacity) && tier.capacity > 0);
      assert.ok(Number.isFinite(tier.prize) && tier.prize > 0);
      assert.ok(Array.isArray(tier.winnerAmounts) && tier.winnerAmounts.length === 1);
    }

    const progress = previewProgress();
    assert.equal(progress.length, 7);
    for (const row of progress) {
      assert.ok(row.code);
      assert.ok(row.sold > 0);
      assert.equal(row.remaining, row.capacity - row.sold);
      assert.equal(row.seedHash, "PREVIEW-ONLY");
    }

    for (const tier of state.tiers) {
      const preview = previewRoundState(tier.code);
      assert.equal(preview.tiers.length, 7);
      assert.ok(preview.candles.length > 0);
      assert.equal(preview.round?.tierCode, tier.code);
      assert.equal(preview.round?.tierId, tier.id);
      assert.equal(preview.round?.capacity, tier.capacity);
      assert.equal(preview.round?.treasuryContribution, tier.treasury);
      assert.equal(preview.round?.adminGrossRevenue, tier.admin);
      assert.equal(preview.round?.tickets.length, preview.round?.sold);
      assert.ok((preview.round?.tickets.length ?? 0) > 0);
      assert.equal(new Set((preview.round?.tickets ?? []).map((ticket) => ticket.serial)).size, preview.round?.tickets.length);
      for (const ticket of preview.round?.tickets ?? []) {
        assert.match(ticket.serial, /^BTX-R\d+-[1-9A-HJ-NP-Za-km-z]{10,}-[1-9A-HJ-NP-Za-km-z]$/);
      }
    }

    for (const tf of ["round", "24h", "30d"]) {
      const payload = previewVaultPayload(tf);
      assert.equal(payload.ok, true);
      assert.equal(payload.tf, tf);
      assert.ok(payload.candles.length > 0);
      assert.equal(payload.summary.count, payload.candles.length);
      for (const candle of payload.candles) {
        assert.ok(Number.isFinite(candle.t));
        assert.ok(candle.h >= Math.max(candle.o, candle.c));
        assert.ok(candle.l <= Math.min(candle.o, candle.c));
        assert.ok(candle.volume >= 0 && candle.fees >= 0 && candle.n >= 1);
      }
    }
  } finally {
    if (previousMode === undefined) delete process.env.BETX_MODE;
    else process.env.BETX_MODE = previousMode;
  }
});

test("non-live preview UI keeps purchases and spins local", async () => {
  const readSource = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
  const provider = await readSource("../src/components/AppProvider.tsx");
  const wheel = await readSource("../src/components/Wheel.tsx");
  const chart = await readSource("../src/components/VaultCandleChart.tsx");
  const stateRoute = await readSource("../src/app/api/state/route.ts");
  const roundRoute = await readSource("../src/app/api/rounds/state/route.ts");
  const progressRoute = await readSource("../src/app/api/tiers/progress/route.ts");
  const candlesRoute = await readSource("../src/app/api/vault/candles/route.ts");
  const sw = await readSource("../public/sw.js");
  const swBuilder = await readSource("../scripts/build-sw.cjs");
  const clientI18n = await readSource("../src/i18n/client.tsx");
  const page = await readSource("../src/app/%5Blocale%5D/page.tsx");
  const sections = await readSource("../src/components/Sections.tsx");
  const onchain = await readSource("../src/components/OnchainTreasury.tsx");
  const pool = await readSource("../src/components/PoolBand.tsx");
  const wallet = await readSource("../src/components/Wallet.tsx");
  const winners = await readSource("../src/components/WinnersHistory.tsx");
  const verify = await readSource("../src/components/VerifyExplorer.tsx");

  assert.match(provider, /const isPreview = demoEnabled \|\| isPreviewAppState\(state\);/);
  assert.doesNotMatch(provider, /demoEnabled \? !isDemoSession/);

  const previewBranch = wheel.indexOf("if (isPreview) {");
  const apiSpin = wheel.indexOf("const res = await spin();");
  assert.ok(previewBranch > -1 && apiSpin > previewBranch);
  assert.match(wheel, /const isDisabled = spinning \|\| \(!isPreview &&/);

  assert.match(chart, /const previewChart = demoEnabled \|\| isPreview;/);
  assert.match(chart, /setData\(previewVaultPayload\(tf\)\)/);
  assert.match(chart, /ledgerVerified \|\| previewChart/);

  assert.match(stateRoute, /if \(isNonLivePreview\(\)\) return previewResponse\(\);/);
  assert.match(roundRoute, /if \(previewable\) \{/);
  assert.match(progressRoute, /if \(isNonLivePreview\(\)\) return previewResponse\(\);/);
  assert.match(candlesRoute, /return NextResponse\.json\(previewVaultPayload\(tf\)/);

  for (const [label, source] of Object.entries({ stateRoute, roundRoute, progressRoute, candlesRoute })) {
    assert.doesNotMatch(
      source,
      /^import(?! type).*from "@\/(?:db|lib\/(?:api|ratelimit|store|vaultCandles))"/m,
      `${label} must not load db-backed helpers before the preview branch`,
    );
  }

  assert.match(sw, /app bundles: network-first/);
  assert.match(swBuilder, /app bundles: network-first/);
  assert.doesNotMatch(sw, /url\.pathname\.startsWith\("\/_next\/static\/"\) \|\|/);

  assert.match(clientI18n, /if \(!mounted \|\| !iso\) return "";/);
  assert.match(clientI18n, /mounted && iso \? df\.format/);
  assert.match(page, /initialState = demoEnabled \? previewState\(SERVER_RENDERED_AT\) : null/);
  assert.match(page, /<AppProvider initialState=\{initialState\}/);
  assert.match(page, /<SiteFooter year=\{new Date\(SERVER_RENDERED_AT\)\.getUTCFullYear\(\)\}/);
  assert.doesNotMatch(sections, /new Date\(\)\.getFullYear\(\)/);
  assert.match(onchain, /mounted && data/);
  for (const [label, source] of Object.entries({ sections, pool, wallet, winners, verify })) {
    assert.doesNotMatch(
      source,
      /suppressHydrationWarning/,
      `${label} must not mask time/locale hydration differences`,
    );
  }
});
