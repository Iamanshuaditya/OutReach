import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/multi-tenant";
import { z } from "zod";
import { formatZodError } from "@/lib/validation";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
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

// GET /api/icp/definitions — List all ICPs with stats
export async function GET(request: NextRequest) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) return auth.response;

  const { orgId } = auth.context;

  const icps = await pool.query(
    `SELECT d.*,
       (SELECT COUNT(*)::int FROM lead_segments ls WHERE ls.icp_id = d.id) AS total_leads,
       (SELECT COUNT(*)::int FROM lead_segments ls WHERE ls.icp_id = d.id AND ls.tier = 'tier_1') AS tier_1_count,
       (SELECT COUNT(*)::int FROM lead_segments ls WHERE ls.icp_id = d.id AND ls.tier = 'tier_2') AS tier_2_count,
       (SELECT COUNT(*)::int FROM lead_segments ls WHERE ls.icp_id = d.id AND ls.tier = 'tier_3') AS tier_3_count,
       (SELECT COUNT(*)::int FROM icp_sub_segments ss WHERE ss.icp_id = d.id) AS sub_segment_count
     FROM icp_definitions d
     WHERE d.org_id = $1
     ORDER BY d.priority ASC, d.created_at ASC`,
    [orgId]
  );

  return NextResponse.json({ definitions: icps.rows });
}

// POST /api/icp/definitions — Create a new ICP
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const data = parsed.data;

  // Check slug uniqueness within org
  const existing = await pool.query(
    `SELECT id FROM icp_definitions WHERE org_id = $1 AND slug = $2`,
    [orgId, data.slug]
  );
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: "An ICP with this slug already exists" }, { status: 409 });
  }

  const result = await pool.query(
    `INSERT INTO icp_definitions
      (org_id, name, slug, description, status, priority,
       filters, scoring_weights, intent_signals,
       relevant_services, best_offer_angle, best_cta,
       typical_budget_range, avg_deal_size, sales_cycle_days,
       value_proposition, likely_objections, qualification_questions)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb,
             $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb)
     RETURNING *`,
    [
      orgId,
      data.name,
      data.slug,
      data.description ?? "",
      data.status ?? "active",
      data.priority ?? 10,
      JSON.stringify(data.filters ?? {}),
      JSON.stringify(data.scoring_weights ?? { fit_weight: 0.25, urgency_weight: 0.25, budget_weight: 0.25, signal_weight: 0.25 }),
      JSON.stringify(data.intent_signals ?? { positive: [], negative: [] }),
      data.relevant_services ?? [],
      data.best_offer_angle ?? "",
      data.best_cta ?? "",
      data.typical_budget_range ?? "",
      data.avg_deal_size ?? 0,
      data.sales_cycle_days ?? 14,
      data.value_proposition ?? "",
      JSON.stringify(data.likely_objections ?? []),
      JSON.stringify(data.qualification_questions ?? []),
    ]
  );

  return NextResponse.json({ definition: result.rows[0] }, { status: 201 });
}
