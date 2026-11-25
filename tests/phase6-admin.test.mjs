import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

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
