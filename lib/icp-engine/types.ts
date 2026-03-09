// ICP Segmentation & Lead Qualification Engine — Type definitions

export interface ICPDefinition {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string;
  status: "active" | "paused" | "archived";
  priority: number;
  filters: ICPSegmentFilters;
  scoring_weights: ScoringWeights;
  intent_signals: IntentSignals;
  relevant_services: string[];
  best_offer_angle: string;
  best_cta: string;
  typical_budget_range: string;
  avg_deal_size: number;
  sales_cycle_days: number;
  value_proposition: string;
  likely_objections: Array<{ objection: string; rebuttal: string }>;
  qualification_questions: string[];
  created_at: string;
  updated_at: string;
}

export interface ICPSegmentFilters {
  titles_include: string[];
  titles_exclude: string[];
  industries_include: string[];
  industries_exclude: string[];
  employee_count_range: [number, number] | null;
  revenue_range: [number, number] | null;
  funding_stages: string[];
  countries: string[];
  states: string[];
  cities: string[];
  company_keywords: string[];
  domain_patterns: string[];
}

export interface ScoringWeights {
  fit_weight: number;
  urgency_weight: number;
  budget_weight: number;
  signal_weight: number;
}

export interface IntentSignals {
  positive: IntentSignalRule[];
  negative: IntentSignalRule[];
}

export interface IntentSignalRule {
  signal: string;
  points: number;
  source_column: string;
}

export interface ICPSubSegment {
  id: string;
  icp_id: string;
  name: string;
  filters_override: Partial<ICPSegmentFilters> | null;
  scoring_override: Partial<ScoringWeights> | null;
  priority: number;
  campaign_tag: string;
  created_at: string;
}

export interface LeadSegment {
  id: string;
  org_id: string;
  source_table: string;
  lead_id: number;
  email: string;
  icp_id: string;
  sub_segment_id: string | null;
  fit_score: number;
  urgency_score: number;
  budget_score: number;
  signal_score: number;
  composite_score: number;
  tier: "tier_1" | "tier_2" | "tier_3";
  campaign_tag: string | null;
  outreach_status: "new" | "queued" | "contacted" | "replied" | "converted" | "disqualified";
  lead_data: Record<string, unknown>;
  scored_at: string;
  created_at: string;
}

export interface ScoringRule {
  id: string;
  org_id: string;
  name: string;
  dimension: "fit" | "urgency" | "budget" | "signal" | "engagement";
  rule_type: "column_match" | "column_range" | "column_exists" | "title_match" | "industry_match";
  column_name: string;
  match_value: string;
  points: number;
  applies_to: string[] | null;
  created_at: string;
}

export interface EmailVerification {
  id: string;
  org_id: string;
  email: string;
  status: "valid" | "invalid" | "catch_all" | "disposable" | "unknown";
  provider: string;
  confidence: number;
  mx_found: boolean;
  smtp_check: boolean;
  verified_at: string;
}

export interface LeadScores {
  fit_score: number;
  urgency_score: number;
  budget_score: number;
  signal_score: number;
  composite_score: number;
  tier: "tier_1" | "tier_2" | "tier_3";
}

export interface ClassificationResult {
  icp_id: string;
  icp_name: string;
  sub_segment_id: string | null;
  sub_segment_name: string | null;
  scores: LeadScores;
  matched: boolean;
}

export interface SegmentationStats {
  total_processed: number;
  total_matched: number;
  by_icp: Array<{
    icp_id: string;
    icp_name: string;
    total: number;
    tier_1: number;
    tier_2: number;
    tier_3: number;
    avg_composite: number;
  }>;
  by_source_table: Array<{
    source_table: string;
    total: number;
    matched: number;
  }>;
}
