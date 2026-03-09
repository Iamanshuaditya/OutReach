import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/multi-tenant";

// GET /api/icp/segments — Query segmented leads with filtering
export async function GET(request: NextRequest) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) return auth.response;

  const { orgId } = auth.context;
  const params = request.nextUrl.searchParams;

  const icpId = params.get("icp_id");
  const tier = params.get("tier");
  const minScore = parseInt(params.get("min_score") || "0");
  const subSegmentId = params.get("sub_segment_id");
  const outreachStatus = params.get("outreach_status");
  const sourceTable = params.get("source_table");
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  const limit = Math.min(200, Math.max(1, parseInt(params.get("limit") || "50")));
  const sortBy = params.get("sort_by") || "composite_score";
  const sortOrder = params.get("sort_order") === "asc" ? "ASC" : "DESC";
  const offset = (page - 1) * limit;

  const conditions: string[] = ["ls.org_id = $1"];
  const values: unknown[] = [orgId];
  let paramIdx = 2;

  if (icpId) {
    conditions.push(`ls.icp_id = $${paramIdx}`);
    values.push(icpId);
    paramIdx++;
  }

  if (tier) {
    conditions.push(`ls.tier = $${paramIdx}`);
    values.push(tier);
    paramIdx++;
  }

  if (minScore > 0) {
    conditions.push(`ls.composite_score >= $${paramIdx}`);
    values.push(minScore);
    paramIdx++;
  }

  if (subSegmentId) {
    conditions.push(`ls.sub_segment_id = $${paramIdx}`);
    values.push(subSegmentId);
    paramIdx++;
  }

  if (outreachStatus) {
    conditions.push(`ls.outreach_status = $${paramIdx}`);
    values.push(outreachStatus);
    paramIdx++;
  }

  if (sourceTable) {
    conditions.push(`ls.source_table = $${paramIdx}`);
    values.push(sourceTable);
    paramIdx++;
  }

  const whereClause = conditions.join(" AND ");

  // Validate sort column
  const allowedSortColumns = ["composite_score", "fit_score", "urgency_score", "budget_score", "signal_score", "scored_at", "created_at"];
  const safeSort = allowedSortColumns.includes(sortBy) ? sortBy : "composite_score";

  // Count
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM lead_segments ls WHERE ${whereClause}`,
    values
  );
  const totalRows = countResult.rows[0]?.count ?? 0;

  // Data with ICP name join
  const dataResult = await pool.query(
    `SELECT ls.*, d.name AS icp_name, d.slug AS icp_slug,
            ss.name AS sub_segment_name
     FROM lead_segments ls
     LEFT JOIN icp_definitions d ON d.id = ls.icp_id
     LEFT JOIN icp_sub_segments ss ON ss.id = ls.sub_segment_id
     WHERE ${whereClause}
     ORDER BY ls.${safeSort} ${sortOrder}
     LIMIT ${limit} OFFSET ${offset}`,
    values
  );

  return NextResponse.json({
    segments: dataResult.rows,
    totalRows,
    page,
    limit,
    totalPages: Math.ceil(totalRows / limit),
  });
}
