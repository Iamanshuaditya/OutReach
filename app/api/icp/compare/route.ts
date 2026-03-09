import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/multi-tenant";

// GET /api/icp/compare — Cross-ICP comparison matrix
export async function GET(request: NextRequest) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) return auth.response;

  const { orgId } = auth.context;

  const icps = await pool.query(
    `SELECT
       d.id, d.name, d.slug, d.priority, d.status,
       d.avg_deal_size, d.sales_cycle_days,
       d.typical_budget_range, d.relevant_services,
       d.best_offer_angle,
       COUNT(ls.id)::int AS total_leads,
       COUNT(*) FILTER (WHERE ls.tier = 'tier_1')::int AS tier_1_leads,
       ROUND(AVG(ls.composite_score))::int AS avg_composite,
       ROUND(AVG(ls.fit_score))::int AS avg_fit,
       ROUND(AVG(ls.urgency_score))::int AS avg_urgency,
       ROUND(AVG(ls.budget_score))::int AS avg_budget,
       ROUND(AVG(ls.signal_score))::int AS avg_signal
     FROM icp_definitions d
     LEFT JOIN lead_segments ls ON ls.icp_id = d.id AND ls.org_id = d.org_id
     WHERE d.org_id = $1
     GROUP BY d.id
     ORDER BY d.priority ASC`,
    [orgId]
  );

  const comparison = icps.rows.map((icp) => {
    const tier1Ratio = icp.total_leads > 0 ? (icp.tier_1_leads / icp.total_leads) : 0;

    return {
      id: icp.id,
      name: icp.name,
      slug: icp.slug,
      priority: icp.priority,
      status: icp.status,
      avg_deal_size: icp.avg_deal_size,
      sales_cycle_days: icp.sales_cycle_days,
      typical_budget_range: icp.typical_budget_range,
      relevant_services: icp.relevant_services,
      total_leads: icp.total_leads,
      tier_1_leads: icp.tier_1_leads,
      tier_1_ratio: Math.round(tier1Ratio * 100),
      avg_scores: {
        composite: icp.avg_composite ?? 0,
        fit: icp.avg_fit ?? 0,
        urgency: icp.avg_urgency ?? 0,
        budget: icp.avg_budget ?? 0,
        signal: icp.avg_signal ?? 0,
      },
      ease_of_closing: icp.sales_cycle_days <= 14 ? "high" : icp.sales_cycle_days <= 30 ? "medium" : "low",
      outbound_friendliness: tier1Ratio >= 0.2 ? "high" : tier1Ratio >= 0.1 ? "medium" : "low",
    };
  });

  return NextResponse.json({ comparison });
}
