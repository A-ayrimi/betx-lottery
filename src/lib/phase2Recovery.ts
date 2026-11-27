import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

export const PHASE2_BASELINE_HEAD = "2178d6af148df771a24e2bcd4902b7b56dcddfe6";
export const PHASE2_SNAPSHOT_DIRECTORY = "PRE-PHASE2-SNAPSHOT";
export const PHASE2_ROLLBACK_BRANCH = "main";

export interface RecoveryStep {
  id: string;
  title: string;
  command: string;
  reversible: boolean;
  touchesLive: boolean;
}

export interface DatabaseRecoveryCheck {
  id: string;
  item: string;
  command: string;
}

export interface RecoverySnapshotVerification {
  ok: boolean;
  snapshotRoot: string;
  head: string | null;
  branch: string | null;
  staged: string | null;
  missingFiles: readonly string[];
  forbiddenEntries: readonly string[];
  checkedFiles: readonly string[];
}

const SNAPSHOT_CHECKED_FILES: readonly string[] = [
  "PHASE2-BASELINE.txt",
  "package.json",
  "tsconfig.json",
  "src/db/schema.ts",
  "src/lib/store.ts",
  "supabase/schema.sql",
  "docs/PHASE-1B-ARCHITECTURE.md",
];

export const PHASE2_RECOVERY_STEPS: readonly RecoveryStep[] = [
  {
    id: "REC-01",
    title: "وضعیت فعلی را قبل از هر اقدام ثبت کن",
    command: "git --no-optional-locks status --short --branch && git rev-parse HEAD && git diff --cached --name-only",
    reversible: true,
    touchesLive: false,
  },
  {
    id: "REC-02",
    title: "تغییرات Phase 2 را ایمن کن",
    command: 'git stash push --include-untracked -m "phase2-pre-restore"',
    reversible: true,
    touchesLive: false,
  },
  {
    id: "REC-03",
    title: "به شاخه baseline بازگرد",
    command: `git switch ${PHASE2_ROLLBACK_BRANCH}`,
    reversible: true,
    touchesLive: false,
  },
  {
    id: "REC-04",
    title: "فایلهای tracked را به HEAD baseline برگردان",
    command: `git restore --source=${PHASE2_BASELINE_HEAD} -- .`,
    reversible: true,
    touchesLive: false,
  },
  {
    id: "REC-05",
    title: "فایلهای untracked phase 2 را پیشنمایش و سپس با تأیید مالک حذف کن",
    command: "git clean -nd && git clean -fd",
    reversible: true,
    touchesLive: false,
  },
  {
    id: "REC-06",
    title: "محتوای اسنپشات پیش از Phase 2 را بازیابی کن",
    command: 'robocopy "F:\\betx-lottery-main1\\PRE-PHASE2-SNAPSHOT" "F:\\betx-lottery-main" /E /XD .git node_modules',
    reversible: true,
    touchesLive: false,
  },
  {
    id: "REC-07",
    title: "پس از بازیابی تستهای ایمنی را اجرا کن",
    command: "npm run typecheck && npm test",
    reversible: true,
    touchesLive: false,
  },
  {
    id: "REC-08",
    title: "در صورت نیاز به بازگشت مجدد، شاخه و stash را احیا کن",
    command: "git switch feat/phase2-architecture && git stash pop",
    reversible: true,
    touchesLive: false,
  },
];

export const PHASE2_DATABASE_RECOVERY_CHECKLIST: readonly DatabaseRecoveryCheck[] = [
  {
    id: "DB-01",
    item: "فقط BETX_TEST_DATABASE_URL ایزوله localhost با نام betx_*test مجاز است",
    command: "test -n \"$BETX_TEST_DATABASE_URL\" && echo \"$BETX_TEST_DATABASE_URL\" | grep -E 'localhost|127\\.0\\.0\\.1'",
  },
  {
    id: "DB-02",
    item: "از live database یا credential واقعی هرگز استفاده نشود",
    command: "unset DATABASE_URL && env | grep -E 'BETX_TEST_DATABASE_URL'",
  },
  {
    id: "DB-03",
    item: "بکاپ تأییدشده دیتابیس ایزوله بازیابی شود",
    command: "pg_restore --clean --if-exists --dbname=\"$BETX_TEST_DATABASE_URL\" <APPROVED_BACKUP_FILE>",
  },
  {
    id: "DB-04",
    item: "migrationهای M1 تا M9 در دیتابیس ایزوله اعمال شوند",
    command: "for f in supabase/migrations/20261126_m*.sql; do psql \"$BETX_TEST_DATABASE_URL\" -f \"$f\"; done",
  },
  {
    id: "DB-05",
    item: "تست parity دیتابیس و PostgreSQL اجرا شود",
    command: "npm test",
  },
  {
    id: "DB-06",
    item: "تنظیمات محیطی تنها از snapshot/.env.example و snapshot/.env.test.example مقایسه شوند",
    command: "fc /b .env.example \"F:\\betx-lottery-main1\\PRE-PHASE2-SNAPSHOT\\.env.example\"",
  },
];

export function resolvePhase2SnapshotRoot(repoRoot: string = process.cwd()): string {
  return join(dirname(repoRoot), "betx-lottery-main1", PHASE2_SNAPSHOT_DIRECTORY);
}

function manifestValue(manifest: string, key: string): string | null {
  const match = manifest.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

export function verifyPhase2Snapshot(
  snapshotRoot: string,
  expectedHead: string = PHASE2_BASELINE_HEAD,
): RecoverySnapshotVerification {
  const manifestPath = join(snapshotRoot, "PHASE2-BASELINE.txt");
  const manifest = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : "";
  const head = manifestValue(manifest, "HEAD");
  const branch = manifestValue(manifest, "branch");
  const staged = manifestValue(manifest, "staged");
  const topLevel = existsSync(snapshotRoot) ? readdirSync(snapshotRoot) : [];
  const forbiddenEntries = topLevel.filter((entry) => entry === ".git" || entry === "node_modules");
  const missingFiles = SNAPSHOT_CHECKED_FILES.filter((file) => !existsSync(join(snapshotRoot, file)));
  return {
    ok:
      head === expectedHead &&
      branch === "main" &&
      staged === "0" &&
      missingFiles.length === 0 &&
      forbiddenEntries.length === 0,
    snapshotRoot,
    head,
    branch,
    staged,
    missingFiles,
    forbiddenEntries,
    checkedFiles: SNAPSHOT_CHECKED_FILES,
  };
}
