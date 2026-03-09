// ICP Segmenter — Batch processor for lead segmentation across source tables

import pool from "@/lib/db";
import type { ICPDefinition, ICPSubSegment, SegmentationStats } from "./types";
import { classifyLead } from "./classifier";

const BATCH_SIZE = 2000;
const UPSERT_CHUNK = 500;
const FIELDS_PER_ROW = 13;

function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export async function loadActiveICPs(orgId: string): Promise<ICPDefinition[]> {
  const result = await pool.query(
    `SELECT * FROM icp_definitions
     WHERE org_id = $1 AND status = 'active'
     ORDER BY priority ASC`,
    [orgId]
  );
  return result.rows as ICPDefinition[];
}

export async function loadSubSegments(
  icpIds: string[]
): Promise<Map<string, ICPSubSegment[]>> {
  if (icpIds.length === 0) return new Map();

  const result = await pool.query(
    `SELECT * FROM icp_sub_segments
     WHERE icp_id = ANY($1)
     ORDER BY priority ASC`,
    [icpIds]
  );

  const map = new Map<string, ICPSubSegment[]>();
  for (const row of result.rows as ICPSubSegment[]) {
    const list = map.get(row.icp_id) || [];
    list.push(row);
    map.set(row.icp_id, list);
  }
  return map;
}

async function getTableRowCount(tableName: string): Promise<number> {
  const estimate = await pool.query(
    `SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = $1`,
    [tableName]
  );
  const est = Number(estimate.rows[0]?.estimate ?? -1);
  if (est > 10000) return est;

  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM ${quote(tableName)}`
  );
  return result.rows[0]?.count ?? 0;
}

async function assertTableExists(tableName: string): Promise<void> {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  if (result.rows.length === 0) {
    throw new Error(`Source table not found: ${tableName}`);
  }
}

async function getIdColumn(tableName: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
       AND column_name IN ('id', 'lead_id')
     ORDER BY CASE WHEN column_name = 'id' THEN 0 ELSE 1 END
     LIMIT 1`,
    [tableName]
  );
  return result.rows.length > 0 ? (result.rows[0].column_name as string) : null;
}

// ─── Batch upsert ───

interface PendingRow {
  orgId: string;
  tableName: string;
  leadId: number;
  email: string;
  icpId: string;
  subSegmentId: string | null;
  fitScore: number;
  urgencyScore: number;
  budgetScore: number;
  signalScore: number;
  compositeScore: number;
  tier: string;
  leadData: string;
}

async function flushBatch(rows: PendingRow[]): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const rowPlaceholders: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const b = i * FIELDS_PER_ROW + 1;
    rowPlaceholders.push(
      `($${b},$${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12}::jsonb,NOW())`
    );
    values.push(
      r.orgId, r.tableName, r.leadId, r.email,
      r.icpId, r.subSegmentId,
      r.fitScore, r.urgencyScore, r.budgetScore, r.signalScore, r.compositeScore,
      r.tier, r.leadData
    );
  }

  await pool.query(
    `INSERT INTO lead_segments
      (org_id, source_table, lead_id, email, icp_id, sub_segment_id,
       fit_score, urgency_score, budget_score, signal_score, composite_score,
       tier, lead_data, scored_at)
     VALUES ${rowPlaceholders.join(",")}
     ON CONFLICT (org_id, source_table, lead_id, icp_id)
     DO UPDATE SET
       email = EXCLUDED.email,
       sub_segment_id = EXCLUDED.sub_segment_id,
       fit_score = EXCLUDED.fit_score,
       urgency_score = EXCLUDED.urgency_score,
       budget_score = EXCLUDED.budget_score,
       signal_score = EXCLUDED.signal_score,
       composite_score = EXCLUDED.composite_score,
       tier = EXCLUDED.tier,
       lead_data = EXCLUDED.lead_data,
       scored_at = NOW()`,
    values
  );
}

/**
 * Run segmentation across specified source tables for an org.
 * Processes leads in read batches of BATCH_SIZE, writes in bulk UPSERT_CHUNK rows at a time.
 */
export async function runSegmentation(
  orgId: string,
  sourceTables: string[],
  icpIds?: string[]
): Promise<SegmentationStats> {
  let icps = await loadActiveICPs(orgId);
  if (icpIds && icpIds.length > 0) {
    icps = icps.filter((icp) => icpIds.includes(icp.id));
  }

  if (icps.length === 0) {
    throw new Error("No active ICPs found for segmentation");
  }

  const subSegments = await loadSubSegments(icps.map((i) => i.id));

  const stats: SegmentationStats = {
    total_processed: 0,
    total_matched: 0,
    by_icp: icps.map((icp) => ({
      icp_id: icp.id,
      icp_name: icp.name,
      total: 0,
      tier_1: 0,
      tier_2: 0,
      tier_3: 0,
      avg_composite: 0,
    })),
    by_source_table: [],
  };

  for (const tableName of sourceTables) {
    await assertTableExists(tableName);

    const idColumn = await getIdColumn(tableName);
    const totalRows = await getTableRowCount(tableName);

    let tableMatched = 0;
    let pending: PendingRow[] = [];

    for (let offset = 0; offset < totalRows; offset += BATCH_SIZE) {
      const orderCol = idColumn ? quote(idColumn) : "ctid";
      const batchResult = await pool.query(
        `SELECT * FROM ${quote(tableName)} ORDER BY ${orderCol} LIMIT $1 OFFSET $2`,
        [BATCH_SIZE, offset]
      );

      const rows = batchResult.rows as Array<Record<string, unknown>>;
      if (rows.length === 0) break;

      for (const row of rows) {
        stats.total_processed++;

        const leadId = idColumn ? Number(row[idColumn]) : stats.total_processed;
        if (!Number.isFinite(leadId)) continue;

        const classification = classifyLead(row, icps, subSegments);
        if (!classification) continue;

        stats.total_matched++;
        tableMatched++;

        pending.push({
          orgId,
          tableName,
          leadId,
          email: findEmail(row),
          icpId: classification.icp_id,
          subSegmentId: classification.sub_segment_id,
          fitScore: classification.scores.fit_score,
          urgencyScore: classification.scores.urgency_score,
          budgetScore: classification.scores.budget_score,
          signalScore: classification.scores.signal_score,
          compositeScore: classification.scores.composite_score,
          tier: classification.scores.tier,
          leadData: JSON.stringify(buildLeadSnapshot(row)),
        });

        // Update stats
        const icpStat = stats.by_icp.find((s) => s.icp_id === classification.icp_id);
        if (icpStat) {
          icpStat.total++;
          if (classification.scores.tier === "tier_1") icpStat.tier_1++;
          else if (classification.scores.tier === "tier_2") icpStat.tier_2++;
          else icpStat.tier_3++;
          icpStat.avg_composite =
            Math.round(
              (icpStat.avg_composite * (icpStat.total - 1) + classification.scores.composite_score) /
                icpStat.total
            );
        }

        if (pending.length >= UPSERT_CHUNK) {
          await flushBatch(pending);
          pending = [];
        }
      }
    }

    // Flush remaining for this table
    if (pending.length > 0) {
      await flushBatch(pending);
      pending = [];
    }

    stats.by_source_table.push({
      source_table: tableName,
      total: totalRows,
      matched: tableMatched,
    });
  }

  return stats;
}

// ─── Helpers ───

const EMAIL_COLUMNS = ["email", "emails", "email_address", "emailaddress"];

function findEmail(row: Record<string, unknown>): string {
  const keys = Object.keys(row);
  for (const candidate of EMAIL_COLUMNS) {
    const match = keys.find((k) => k.toLowerCase() === candidate);
    if (match && typeof row[match] === "string") {
      return (row[match] as string).trim().toLowerCase();
    }
  }
  return "";
}

function buildLeadSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  const importantFields = [
    "name", "first_name", "last_name", "email", "title", "job_title",
    "company", "company_name", "industry", "city", "state", "country",
    "website", "linkedin", "linkedin_url", "phone", "employee_count",
    "funding_stage", "revenue", "follower_count",
  ];

  for (const key of Object.keys(row)) {
    if (importantFields.includes(key.toLowerCase())) {
      snapshot[key] = row[key];
    }
  }

  return snapshot;
}
