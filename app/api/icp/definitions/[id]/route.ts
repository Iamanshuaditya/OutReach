import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/multi-tenant";
import { z } from "zod";
import { formatZodError } from "@/lib/validation";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
  priority: z.coerce.number().int().min(1).max(100).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  scoring_weights: z.record(z.string(), z.unknown()).optional(),
  intent_signals: z.record(z.string(), z.unknown()).optional(),
  relevant_services: z.array(z.string()).optional(),
  best_offer_angle: z.string().max(2000).optional(),
  best_cta: z.string().max(500).optional(),
  typical_budget_range: z.string().max(100).optional(),
  avg_deal_size: z.coerce.number().int().min(0).optional(),
  sales_cycle_days: z.coerce.number().int().min(1).max(365).optional(),
  value_proposition: z.string().max(5000).optional(),
  likely_objections: z.array(z.object({ objection: z.string(), rebuttal: z.string() })).optional(),
  qualification_questions: z.array(z.string()).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/icp/definitions/[id] — Get single ICP with sub-segments
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const { orgId } = auth.context;

  const icpResult = await pool.query(
    `SELECT * FROM icp_definitions WHERE id = $1 AND org_id = $2`,
    [id, orgId]
  );

  if (icpResult.rows.length === 0) {
    return NextResponse.json({ error: "ICP not found" }, { status: 404 });
  }

  const subSegments = await pool.query(
    `SELECT * FROM icp_sub_segments WHERE icp_id = $1 ORDER BY priority ASC`,
    [id]
  );

  const stats = await pool.query(
    `SELECT
       COUNT(*)::int AS total_leads,
       COUNT(*) FILTER (WHERE tier = 'tier_1')::int AS tier_1,
       COUNT(*) FILTER (WHERE tier = 'tier_2')::int AS tier_2,
       COUNT(*) FILTER (WHERE tier = 'tier_3')::int AS tier_3,
       ROUND(AVG(composite_score))::int AS avg_composite,
       ROUND(AVG(fit_score))::int AS avg_fit
     FROM lead_segments
     WHERE icp_id = $1 AND org_id = $2`,
    [id, orgId]
  );

  return NextResponse.json({
    definition: icpResult.rows[0],
    sub_segments: subSegments.rows,
    stats: stats.rows[0] ?? { total_leads: 0, tier_1: 0, tier_2: 0, tier_3: 0, avg_composite: 0, avg_fit: 0 },
  });
}

// PUT /api/icp/definitions/[id] — Update ICP
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const { orgId } = auth.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const data = parsed.data;

  // Build dynamic SET clause
  const sets: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 3; // $1=id, $2=orgId

  const fieldMap: Record<string, unknown> = {
    name: data.name,
    description: data.description,
    status: data.status,
    priority: data.priority,
    relevant_services: data.relevant_services,
    best_offer_angle: data.best_offer_angle,
    best_cta: data.best_cta,
    typical_budget_range: data.typical_budget_range,
    avg_deal_size: data.avg_deal_size,
    sales_cycle_days: data.sales_cycle_days,
    value_proposition: data.value_proposition,
  };

  for (const [key, val] of Object.entries(fieldMap)) {
    if (val !== undefined) {
      sets.push(`${key} = $${paramIndex}`);
      values.push(val);
      paramIndex++;
    }
  }

  // JSONB fields
  const jsonbFields: Record<string, unknown> = {
    filters: data.filters,
    scoring_weights: data.scoring_weights,
    intent_signals: data.intent_signals,
    likely_objections: data.likely_objections,
    qualification_questions: data.qualification_questions,
  };

  for (const [key, val] of Object.entries(jsonbFields)) {
    if (val !== undefined) {
      sets.push(`${key} = $${paramIndex}::jsonb`);
      values.push(JSON.stringify(val));
      paramIndex++;
    }
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  sets.push("updated_at = NOW()");

  const result = await pool.query(
    `UPDATE icp_definitions SET ${sets.join(", ")}
     WHERE id = $1 AND org_id = $2
     RETURNING *`,
    [id, orgId, ...values]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "ICP not found" }, { status: 404 });
  }

  return NextResponse.json({ definition: result.rows[0] });
}

// DELETE /api/icp/definitions/[id] — Delete ICP
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const { orgId } = auth.context;

  const result = await pool.query(
    `DELETE FROM icp_definitions WHERE id = $1 AND org_id = $2 RETURNING id`,
    [id, orgId]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "ICP not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
