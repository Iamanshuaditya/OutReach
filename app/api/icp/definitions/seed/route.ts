import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/multi-tenant";
import { ICP_PRESETS } from "@/lib/icp-engine/presets";

// POST /api/icp/definitions/seed — Seed the 4 preset ICPs
export async function POST(request: NextRequest) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) return auth.response;

  const { orgId } = auth.context;

  const seeded: string[] = [];
  const skipped: string[] = [];

  for (const preset of ICP_PRESETS) {
    // Check if already exists
    const existing = await pool.query(
      `SELECT id FROM icp_definitions WHERE org_id = $1 AND slug = $2`,
      [orgId, preset.slug]
    );

    if (existing.rows.length > 0) {
      skipped.push(preset.name);
      continue;
    }

    // Insert ICP definition
    const icpResult = await pool.query(
      `INSERT INTO icp_definitions
        (org_id, name, slug, description, status, priority,
         filters, scoring_weights, intent_signals,
         relevant_services, best_offer_angle, best_cta,
         typical_budget_range, avg_deal_size, sales_cycle_days,
         value_proposition, likely_objections, qualification_questions)
       VALUES ($1, $2, $3, $4, 'active', $5,
               $6::jsonb, $7::jsonb, $8::jsonb,
               $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb)
       RETURNING id`,
      [
        orgId,
        preset.name,
        preset.slug,
        preset.description,
        preset.priority,
        JSON.stringify(preset.filters),
        JSON.stringify(preset.scoring_weights),
        JSON.stringify(preset.intent_signals),
        preset.relevant_services,
        preset.best_offer_angle,
        preset.best_cta,
        preset.typical_budget_range,
        preset.avg_deal_size,
        preset.sales_cycle_days,
        preset.value_proposition,
        JSON.stringify(preset.likely_objections),
        JSON.stringify(preset.qualification_questions),
      ]
    );

    const icpId = icpResult.rows[0].id as string;

    // Insert sub-segments
    for (const sub of preset.sub_segments) {
      await pool.query(
        `INSERT INTO icp_sub_segments
          (icp_id, name, filters_override, scoring_override, priority, campaign_tag)
         VALUES ($1, $2, $3::jsonb, NULL, $4, $5)`,
        [
          icpId,
          sub.name,
          sub.filters_override ? JSON.stringify(sub.filters_override) : null,
          sub.priority,
          sub.campaign_tag,
        ]
      );
    }

    seeded.push(preset.name);
  }

  return NextResponse.json({
    seeded,
    skipped,
    message: `Seeded ${seeded.length} ICPs, skipped ${skipped.length} (already exist)`,
  });
}
