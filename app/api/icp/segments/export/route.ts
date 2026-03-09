import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/multi-tenant";
import { z } from "zod";
import { formatZodError } from "@/lib/validation";

const exportSchema = z.object({
  icp_id: z.string().uuid(),
  tier: z.enum(["tier_1", "tier_2", "tier_3"]).optional(),
  sub_segment_id: z.string().uuid().optional(),
  min_score: z.coerce.number().int().min(0).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50000).optional(),
  campaign_tag: z.string().trim().max(100).optional(),
});

// POST /api/icp/segments/export — Export segment for campaign use
export async function POST(request: NextRequest) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) return auth.response;

  const { orgId } = auth.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = exportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const data = parsed.data;

  const conditions: string[] = ["org_id = $1", "icp_id = $2"];
  const values: unknown[] = [orgId, data.icp_id];
  let paramIdx = 3;

  if (data.tier) {
    conditions.push(`tier = $${paramIdx}`);
    values.push(data.tier);
    paramIdx++;
  }

  if (data.sub_segment_id) {
    conditions.push(`sub_segment_id = $${paramIdx}`);
    values.push(data.sub_segment_id);
    paramIdx++;
  }

  if (data.min_score) {
    conditions.push(`composite_score >= $${paramIdx}`);
    values.push(data.min_score);
    paramIdx++;
  }

  const maxRows = data.limit ?? 10000;
  const whereClause = conditions.join(" AND ");

  // Tag leads if campaign_tag provided
  if (data.campaign_tag) {
    await pool.query(
      `UPDATE lead_segments SET campaign_tag = $${paramIdx}, outreach_status = 'queued'
       WHERE ${whereClause}`,
      [...values, data.campaign_tag]
    );
  }

  // Fetch leads
  const result = await pool.query(
    `SELECT id, email, lead_id, source_table, lead_data,
            composite_score, fit_score, tier, sub_segment_id
     FROM lead_segments
     WHERE ${whereClause}
     ORDER BY composite_score DESC
     LIMIT ${maxRows}`,
    values
  );

  // Build segment source identifier for campaign engine
  const segmentSource = data.sub_segment_id
    ? `segment::${data.icp_id}::sub::${data.sub_segment_id}`
    : `segment::${data.icp_id}::${data.tier ?? "all"}`;

  return NextResponse.json({
    segment_source: segmentSource,
    leads: result.rows,
    total: result.rows.length,
  });
}
