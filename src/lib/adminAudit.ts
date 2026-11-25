import { desc } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLog } from "@/db/schema";

export async function listAdminAuditLog(limit = 100) {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit) || 100));
  const rows = await db
    .select()
    .from(adminAuditLog)
    .orderBy(desc(adminAuditLog.id))
    .limit(safeLimit);
  return rows.map((row) => ({
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
  }));
}
