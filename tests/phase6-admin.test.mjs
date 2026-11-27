import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";

async function read(relative) {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

test("admin RBAC separates full admins from read-only viewers", async () => {
  const admin = await read("../src/lib/admin.ts");
  const config = await read("../src/lib/config.ts");
  assert.match(admin, /export type AdminRole = "ADMIN" \| "VIEWER"/);
  assert.match(admin, /tokenMatches\(got, config\.adminViewerToken\)/);
  assert.match(admin, /requireAdminRole\(req: NextRequest, roles: readonly AdminRole\[\]\)/);
  assert.match(config, /get adminViewerToken\(\)/);
});

test("tier management routes enforce role requirements", async () => {
  const list = await read("../src/app/api/admin/tiers/route.ts");
  const detail = await read("../src/app/api/admin/tiers/[id]/route.ts");
  const report = await read("../src/app/api/admin/reports/tiers/route.ts");
  const audit = await read("../src/app/api/admin/audit/route.ts");

  assert.match(list, /requireAdminRole\(req, \["ADMIN", "VIEWER"\]\)/);
  assert.match(list, /requireAdminRole\(req, \["ADMIN"\]\)/);
  assert.match(detail, /requireAdminRole\(req, \["ADMIN"\]\)/);
  assert.match(report, /requireAdminRole\(req, \["ADMIN", "VIEWER"\]\)/);
  assert.match(audit, /requireAdminRole\(req, \["ADMIN", "VIEWER"\]\)/);
});

test("tier mutations validate input and write audit records", async () => {
  const source = await read("../src/lib/tierAdmin.ts");
  for (const action of ["tier.create", "tier.update", "tier.status"]) {
    assert.match(source, new RegExp(`action: "${action}"`));
  }
  assert.match(source, /deriveTierAmounts\(\{/);
  assert.match(source, /Maximum participants is outside the allowed range/);
  assert.match(source, /input\.maximumParticipants === undefined \? before\.maximumParticipants/);
});

test("admin UI exposes tier management, tier reports, and audit log", async () => {
  const page = await read("../src/app/admin/page.tsx");
  assert.match(page, /<TierManagementPanel token=\{token\} \/>/);
  assert.match(page, /<TierReportsPanel token=\{token\} \/>/);
  assert.match(page, /<AuditLogPanel token=\{token\} \/>/);
  assert.match(page, /\/api\/admin\/reports\/tiers/);
  assert.match(page, /\/api\/admin\/audit\?limit=100/);
});

test("tier reports group performance by tier", async () => {
  const source = await read("../src/lib/tierReports.ts");
  assert.match(source, /from ticket_tiers t/);
  assert.match(source, /group by tier_id/);
  assert.match(source, /tierRevenue|ticketRevenue/);
});

const EXPECTED_ADMIN_POLICY = {
  "audit/route.ts": { GET: "ADMIN,VIEWER" },
  "automation/route.ts": { GET: "ADMIN", POST: "ADMIN" },
  "fees/route.ts": { GET: "ADMIN", POST: "ADMIN" },
  "reports/reconciliation/route.ts": { GET: "ADMIN" },
  "reports/tiers/route.ts": { GET: "ADMIN,VIEWER" },
  "rounds/open/route.ts": { POST: "ADMIN" },
  "rounds/[id]/review/route.ts": { POST: "ADMIN" },
  "rounds/[id]/settle/route.ts": { POST: "ADMIN" },
  "tiers/route.ts": { GET: "ADMIN,VIEWER", POST: "ADMIN" },
  "tiers/[id]/route.ts": { PATCH: "ADMIN", DELETE: "ADMIN" },
  "treasury/initialize/route.ts": { POST: "ADMIN" },
  "withdrawals/route.ts": { GET: "ADMIN", POST: "ADMIN" },
  "withdrawals/pay/route.ts": { POST: "ADMIN" },
};

const AUTH_FIRST = /if \(!isAdmin\(req\)\)|if \(!requireAdminRole\(req,|const auth = requireAdminRole\(req,/;

async function listAdminRouteFiles(dir = "../src/app/api/admin/", prefix = "") {
  const entries = await readdir(new URL(dir, import.meta.url), { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...await listAdminRouteFiles(`${dir}${entry.name}/`, name));
    } else if (entry.name === "route.ts") {
      found.push(name);
    }
  }
  return found.sort();
}

function handlerBlocks(source) {
  const lines = source.split(/\r?\n/);
  const handlers = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^export async function (GET|POST|PATCH|PUT|DELETE)\s*\(/);
    if (match) handlers.push({ method: match[1], body: lines.slice(index + 1, index + 9) });
  }
  return handlers;
}

function firstStatement(body) {
  return body.find((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
  }) ?? "";
}

function roleFromStatement(statement) {
  if (/isAdmin\(req\)/.test(statement)) return "ADMIN";
  const roles = statement.match(/requireAdminRole\(req,\s*\[([^\]]+)\]\)/);
  return roles ? roles[1].replace(/["'\s]/g, "") : null;
}

function assertAuthorizationFirst(route, method, body) {
  const guardIndex = body.findIndex((line) => AUTH_FIRST.test(line));
  assert.ok(guardIndex >= 0, `${route} ${method} must include a server-side authorization guard`);
  assert.match(firstStatement(body), AUTH_FIRST, `${route} ${method} must authorize before handling input`);
  const beforeGuard = body.slice(0, guardIndex).join("\n");
  assert.doesNotMatch(
    beforeGuard,
    /req\.json\(|\bawait\b|\bdb\.|\bprocessWithdrawal\(|\brunAutomation\(|\bcreateTier\(|\bupdateTier\(|\bsetTierStatus\(|\bopenAdminRound\(|\bapproveRoundResult\(|\bsettleApprovedRound\(/,
    `${route} ${method} must not process data or cause side effects before authorization`,
  );
  if (/^const auth = requireAdminRole\(/.test(firstStatement(body).trim())) {
    assert.match(body.slice(guardIndex, guardIndex + 3).join("\n"), /if \(!auth\)/);
  }
}

test("every admin route authorizes before reading input or causing side effects", async () => {
  const files = await listAdminRouteFiles();
  assert.deepEqual(files, Object.keys(EXPECTED_ADMIN_POLICY).sort());
  for (const file of files) {
    const source = await read(`../src/app/api/admin/${file}`);
    assert.match(source, /from "@\/lib\/admin"/, `${file} must import server authorization`);
    assert.doesNotMatch(source, /["']use client["']/, `${file} must stay server-side`);
    const handlers = handlerBlocks(source);
    assert.ok(handlers.length > 0, `${file} must export HTTP handlers`);
    assert.deepEqual(
      handlers.map((handler) => handler.method).sort(),
      Object.keys(EXPECTED_ADMIN_POLICY[file]).sort(),
      `${file} exported HTTP methods changed`,
    );
    for (const handler of handlers) assertAuthorizationFirst(file, handler.method, handler.body);
  }
});

test("admin and viewer role permissions match the documented policy", async () => {
  for (const [file, expected] of Object.entries(EXPECTED_ADMIN_POLICY)) {
    const source = await read(`../src/app/api/admin/${file}`);
    for (const handler of handlerBlocks(source)) {
      assert.equal(
        roleFromStatement(firstStatement(handler.body)),
        expected[handler.method],
        `${file} ${handler.method} role policy changed`,
      );
    }
  }
});

test("missing, invalid, and undersized admin tokens fail closed", async () => {
  const admin = await read("../src/lib/admin.ts");
  const config = await read("../src/lib/config.ts");
  assert.match(admin, /const got = req\.headers\.get\("x-admin-token"\) \|\| ""/);
  assert.match(admin, /if \(!expected \|\| expected\.length < 16\) return false/);
  assert.match(admin, /a\.length === b\.length && timingSafeEqual\(a, b\)/);
  assert.match(admin, /if \(tokenMatches\(got, config\.adminToken\)\) return "ADMIN"/);
  assert.match(admin, /if \(tokenMatches\(got, config\.adminViewerToken\)\) return "VIEWER"/);
  assert.match(admin, /return null/);
  assert.match(config, /process\.env\.ADMIN_TOKEN \|\| ""/);
  assert.match(config, /process\.env\.ADMIN_VIEWER_TOKEN \|\| ""/);
});

test("client-side admin UI is never treated as an authorization boundary", async () => {
  const page = await read("../src/app/admin/page.tsx");
  assert.match(page, /^\uFEFF?"use client";/);
  assert.doesNotMatch(page, /from "@\/lib\/admin"/);
  assert.doesNotMatch(page, /\bisAdmin\(|\brequireAdminRole\(|\bgetAdminRole\(/);
  assert.doesNotMatch(page, /["']use server["']/);
  assert.match(page, /sessionStorage\.setItem\("betx_admin", t\)/);
  for (const file of await listAdminRouteFiles()) {
    const source = await read(`../src/app/api/admin/${file}`);
    assert.match(source, /from "@\/lib\/admin"/, `${file} must enforce authorization server-side`);
    assert.doesNotMatch(source, /["']use client["']/, `${file} must not be a client component`);
  }
});

test("automation evaluate mode is distinct from automation execution", async () => {
  const route = await read("../src/app/api/admin/automation/route.ts");
  const marker = 'if (body.action === "evaluate")';
  assert.match(route, /if \(body\.action === "evaluate"\)/);
  const parts = route.split(marker);
  assert.equal(parts.length, 2);
  const evaluateBlock = parts[1].split('const result = await runAutomation("admin")')[0];
  assert.match(evaluateBlock, /await evaluate\(w, cfg\)/);
  assert.match(evaluateBlock, /decisions/);
  assert.doesNotMatch(evaluateBlock, /runAutomation\(|processWithdrawal\(|broadcast\(|settleApprovedRound\(|drawFullRounds\(/);
  assert.match(parts[1], /const result = await runAutomation\("admin"\)/);
  const page = await read("../src/app/admin/page.tsx");
  assert.match(page, /call\("evaluate"\)/);
  assert.match(page, /call\("run"\)/);
});

test("admin automation execution is guarded in maintenance mode", async () => {
  const route = await read("../src/app/api/admin/automation/route.ts");
  assert.match(route, /isMaintenanceMode\(\)/);
  const maintenanceIdx = route.indexOf("isMaintenanceMode()");
  const runIdx = route.indexOf('runAutomation("admin")');
  assert.ok(maintenanceIdx >= 0 && runIdx > maintenanceIdx, "maintenance guard must precede admin automation run");
});

test("public /api/state is a pure read and does not trigger automation heartbeat", async () => {
  const route = await read("../src/app/api/state/route.ts");
  assert.match(route, /export async function GET\(\)/);
  assert.doesNotMatch(route, /NextRequest|isAdmin\(|requireAdminRole\(/);
  assert.doesNotMatch(route, /after\(|maybeRunAutomation|runAutomation|@\/lib\/automation/);
  assert.match(route, /getState\(\)/);
});

test("admin audit actor is bound to the verified operator session", async () => {
  const admin = await read("../src/lib/admin.ts");
  const runtime = await read("../src/lib/phase2Runtime.ts");
  assert.match(admin, /export function getAdminActor\(req: NextRequest\): AdminActor \| null/);
  assert.match(admin, /tokenFingerprint\(token\)/);
  assert.match(admin, /sessionRef: `session:\$\{roleSnapshot\}:\$\{fingerprint\}`/);
  assert.match(runtime, /operatorRefFromActor\(input\.actor\)/);
  assert.match(runtime, /sessionRefFromActor\(input\.actor\)/);
  assert.match(runtime, /roleSnapshot = input\.roleSnapshot \?\? roleSnapshotFromActor\(input\.actor\)/);

  const routes = [
    ["../src/app/api/admin/rounds/open/route.ts", /openAdminRound\(auth\.actor, tierSelector\)/],
    ["../src/app/api/admin/rounds/[id]/review/route.ts", /approveRoundResult\(roundId, body\.approved, auth\.actor\)/],
    ["../src/app/api/admin/rounds/[id]/settle/route.ts", /settleApprovedRound\(roundId, auth\.actor\)/],
    ["../src/app/api/admin/treasury/initialize/route.ts", /initializeAdminVault\(auth\.actor\)/],
    ["../src/app/api/admin/withdrawals/route.ts", /auth\.actor,/],
    ["../src/app/api/admin/withdrawals/pay/route.ts", /processWithdrawal\(w\.id, "paid", txid, undefined, auth\.actor\)/],
  ];
  for (const [path, pattern] of routes) assert.match(await read(path), pattern, `${path} must propagate the verified actor`);
});
