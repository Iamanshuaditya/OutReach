import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/multi-tenant";

// GET /api/icp/recommend — Targeting recommendations
export async function GET(request: NextRequest) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) return auth.response;

  const { orgId } = auth.context;

  const icps = await pool.query(
    `SELECT
       d.id, d.name, d.slug, d.priority, d.status,
       d.avg_deal_size, d.sales_cycle_days,
       COUNT(ls.id)::int AS total_leads,
       COUNT(*) FILTER (WHERE ls.tier = 'tier_1')::int AS tier_1_leads,
       COUNT(*) FILTER (WHERE ls.tier = 'tier_2')::int AS tier_2_leads,
       ROUND(AVG(ls.composite_score))::int AS avg_composite,
       ROUND(AVG(ls.fit_score))::int AS avg_fit
     FROM icp_definitions d
     LEFT JOIN lead_segments ls ON ls.icp_id = d.id AND ls.org_id = d.org_id
     WHERE d.org_id = $1 AND d.status = 'active'
     GROUP BY d.id
     ORDER BY d.priority ASC`,
    [orgId]
  );

  const recommendations = icps.rows.map((icp) => {
    const reasons: string[] = [];
    let score = 0;

    // Score based on lead volume
    if (icp.tier_1_leads >= 100) {
      score += 30;
      reasons.push(`${icp.tier_1_leads} Tier 1 leads ready for outreach`);
    } else if (icp.tier_1_leads >= 20) {
      score += 15;
      reasons.push(`${icp.tier_1_leads} Tier 1 leads available`);
    } else if (icp.tier_1_leads > 0) {
      score += 5;
      reasons.push(`Only ${icp.tier_1_leads} Tier 1 leads — consider expanding filters`);
    } else {
      reasons.push("No Tier 1 leads yet — run segmentation first");
    }

    // Score based on deal size and cycle
    if (icp.avg_deal_size >= 10000) {
      score += 20;
      reasons.push(`High avg deal size ($${icp.avg_deal_size.toLocaleString()})`);
    }

    if (icp.sales_cycle_days <= 14) {
      score += 15;
      reasons.push("Short sales cycle — quick wins possible");
    } else if (icp.sales_cycle_days <= 30) {
      score += 8;
    }

    // Score based on fit quality
    if ((icp.avg_fit ?? 0) >= 60) {
      score += 15;
      reasons.push("High average fit score across leads");
    }

    // Agencies need case studies
    if (icp.slug === "agencies") {
      reasons.push("Needs case studies before aggressive outreach — consider warm intros first");
      score -= 10;
    }

    return {
      icp_id: icp.id,
      icp_name: icp.name,
      priority: icp.priority,
      recommendation_score: Math.max(0, score),
      total_leads: icp.total_leads,
      tier_1_leads: icp.tier_1_leads,
      tier_2_leads: icp.tier_2_leads,
      avg_deal_size: icp.avg_deal_size,
      sales_cycle_days: icp.sales_cycle_days,
      reasons,
    };
  });

  // Sort by recommendation score
  recommendations.sort((a, b) => b.recommendation_score - a.recommendation_score);

  // Suggested campaign sequence
  const sequence = recommendations
    .filter((r) => r.tier_1_leads > 0)
    .map((r, idx) => ({
      order: idx + 1,
      icp_name: r.icp_name,
      suggested_batch_size: Math.min(r.tier_1_leads, 100),
      reason: r.reasons[0] || "",
    }));

  return NextResponse.json({
    recommendations,
    suggested_sequence: sequence,
  });
}
