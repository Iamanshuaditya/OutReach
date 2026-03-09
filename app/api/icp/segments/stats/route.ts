import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/multi-tenant";

// GET /api/icp/segments/stats — Dashboard stats
export async function GET(request: NextRequest) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) return auth.response;

  const { orgId } = auth.context;

  // Per-ICP breakdown
  const icpStats = await pool.query(
    `SELECT
       d.id AS icp_id,
       d.name AS icp_name,
       d.slug AS icp_slug,
       d.priority,
       COUNT(ls.id)::int AS total_leads,
       COUNT(*) FILTER (WHERE ls.tier = 'tier_1')::int AS tier_1,
       COUNT(*) FILTER (WHERE ls.tier = 'tier_2')::int AS tier_2,
       COUNT(*) FILTER (WHERE ls.tier = 'tier_3')::int AS tier_3,
       ROUND(AVG(ls.composite_score))::int AS avg_composite,
       ROUND(AVG(ls.fit_score))::int AS avg_fit,
       ROUND(AVG(ls.urgency_score))::int AS avg_urgency,
       ROUND(AVG(ls.budget_score))::int AS avg_budget
     FROM icp_definitions d
     LEFT JOIN lead_segments ls ON ls.icp_id = d.id AND ls.org_id = d.org_id
     WHERE d.org_id = $1
     GROUP BY d.id, d.name, d.slug, d.priority
     ORDER BY d.priority ASC`,
    [orgId]
  );

  // Overall totals
  const totals = await pool.query(
    `SELECT
       COUNT(*)::int AS total_segmented,
       COUNT(*) FILTER (WHERE tier = 'tier_1')::int AS total_tier_1,
       COUNT(*) FILTER (WHERE tier = 'tier_2')::int AS total_tier_2,
       COUNT(*) FILTER (WHERE tier = 'tier_3')::int AS total_tier_3,
       ROUND(AVG(composite_score))::int AS avg_composite
     FROM lead_segments
     WHERE org_id = $1`,
    [orgId]
  );

  // Score distribution buckets
  const distribution = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE composite_score >= 90)::int AS score_90_100,
       COUNT(*) FILTER (WHERE composite_score >= 75 AND composite_score < 90)::int AS score_75_89,
       COUNT(*) FILTER (WHERE composite_score >= 50 AND composite_score < 75)::int AS score_50_74,
       COUNT(*) FILTER (WHERE composite_score >= 25 AND composite_score < 50)::int AS score_25_49,
       COUNT(*) FILTER (WHERE composite_score < 25)::int AS score_0_24
     FROM lead_segments
     WHERE org_id = $1`,
    [orgId]
  );

  // Top source tables
  const sourceTables = await pool.query(
    `SELECT source_table, COUNT(*)::int AS lead_count,
       ROUND(AVG(composite_score))::int AS avg_score
     FROM lead_segments
     WHERE org_id = $1
     GROUP BY source_table
     ORDER BY lead_count DESC
     LIMIT 20`,
    [orgId]
  );

  // Outreach status breakdown
  const outreachStats = await pool.query(
    `SELECT outreach_status, COUNT(*)::int AS count
     FROM lead_segments
     WHERE org_id = $1
     GROUP BY outreach_status
     ORDER BY count DESC`,
    [orgId]
  );

  return NextResponse.json({
    by_icp: icpStats.rows,
    totals: totals.rows[0] ?? { total_segmented: 0, total_tier_1: 0, total_tier_2: 0, total_tier_3: 0, avg_composite: 0 },
    score_distribution: distribution.rows[0] ?? {},
    source_tables: sourceTables.rows,
    outreach_status: outreachStats.rows,
  });
}
