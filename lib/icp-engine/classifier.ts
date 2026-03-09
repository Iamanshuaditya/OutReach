// ICP Classifier — Classifies a single lead against all active ICPs

import type { ICPDefinition, ICPSubSegment, ClassificationResult } from "./types";
import { scoreLeadAgainstICP, passesBasicFilters, computeFitScore } from "./scorer";

/**
 * Classify a lead against all active ICPs and return the best match.
 * Returns null if the lead doesn't pass basic filters for any ICP.
 */
export function classifyLead(
  leadData: Record<string, unknown>,
  icps: ICPDefinition[],
  subSegments: Map<string, ICPSubSegment[]>
): ClassificationResult | null {
  const results: ClassificationResult[] = [];

  for (const icp of icps) {
    if (icp.status !== "active") continue;

    if (!passesBasicFilters(leadData, icp.filters)) continue;

    const scores = scoreLeadAgainstICP(leadData, icp);

    // Find best matching sub-segment
    const icpSubs = subSegments.get(icp.id) || [];
    let bestSub: ICPSubSegment | null = null;
    let bestSubFit = -1;

    for (const sub of icpSubs) {
      if (sub.filters_override) {
        const mergedFilters = { ...icp.filters, ...sub.filters_override };
        const subFit = computeFitScore(leadData, mergedFilters);
        if (subFit > bestSubFit) {
          bestSubFit = subFit;
          bestSub = sub;
        }
      }
    }

    results.push({
      icp_id: icp.id,
      icp_name: icp.name,
      sub_segment_id: bestSub?.id ?? null,
      sub_segment_name: bestSub?.name ?? null,
      scores,
      matched: scores.fit_score > 0,
    });
  }

  if (results.length === 0) return null;

  // Return the best match by composite score, breaking ties by ICP priority
  results.sort((a, b) => {
    if (b.scores.composite_score !== a.scores.composite_score) {
      return b.scores.composite_score - a.scores.composite_score;
    }
    // Lower priority number = higher priority
    const aIcp = icps.find((i) => i.id === a.icp_id);
    const bIcp = icps.find((i) => i.id === b.icp_id);
    return (aIcp?.priority ?? 99) - (bIcp?.priority ?? 99);
  });

  return results[0].matched ? results[0] : null;
}

/**
 * Classify a lead against ALL active ICPs and return all matches (not just best).
 * Useful for leads that fit multiple ICPs.
 */
export function classifyLeadAllICPs(
  leadData: Record<string, unknown>,
  icps: ICPDefinition[],
  subSegments: Map<string, ICPSubSegment[]>
): ClassificationResult[] {
  const results: ClassificationResult[] = [];

  for (const icp of icps) {
    if (icp.status !== "active") continue;
    if (!passesBasicFilters(leadData, icp.filters)) continue;

    const scores = scoreLeadAgainstICP(leadData, icp);

    const icpSubs = subSegments.get(icp.id) || [];
    let bestSub: ICPSubSegment | null = null;
    let bestSubFit = -1;

    for (const sub of icpSubs) {
      if (sub.filters_override) {
        const mergedFilters = { ...icp.filters, ...sub.filters_override };
        const subFit = computeFitScore(leadData, mergedFilters);
        if (subFit > bestSubFit) {
          bestSubFit = subFit;
          bestSub = sub;
        }
      }
    }

    if (scores.fit_score > 0) {
      results.push({
        icp_id: icp.id,
        icp_name: icp.name,
        sub_segment_id: bestSub?.id ?? null,
        sub_segment_name: bestSub?.name ?? null,
        scores,
        matched: true,
      });
    }
  }

  return results.sort((a, b) => b.scores.composite_score - a.scores.composite_score);
}
