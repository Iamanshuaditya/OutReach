// ICP Scoring Engine — Scores a lead against an ICP definition

import type {
  ICPDefinition,
  ICPSegmentFilters,
  ScoringWeights,
  IntentSignals,
  LeadScores,
} from "./types";

// Extended COLUMN_MAP for flexible column matching across diverse lead tables.
// Covers Apollo, LinkedIn Sales Navigator, ZoomInfo, BuiltWith, and common CSV exports.
const COLUMN_MAP: Record<string, string[]> = {
  title: [
    "title", "job_title", "designation", "jobtitle", "position", "headline",
    "person_title", "contact_title", "role", "job_role", "seniority",
  ],
  company: [
    "company", "companyname", "companynameforemails", "organization_name",
    "company_name", "organisation", "org_name", "account_name", "employer",
  ],
  industry: [
    "industry", "sector", "organization_industry", "company_industry",
    "vertical", "niche", "market", "business_type",
  ],
  city: ["city", "location_city", "person_city", "contact_city", "metro"],
  state: ["state", "region", "location_state", "person_state", "province"],
  country: [
    "country", "location_country", "organization_country",
    "person_country", "contact_country", "geo",
  ],
  email: [
    "email", "emails", "email_address", "emailaddress", "contact_email",
    "person_email", "work_email", "primary_email",
  ],
  website: [
    "website", "organization_website_url", "company_website", "url", "domain",
    "company_url", "company_domain", "web", "homepage",
  ],
  linkedin: [
    "linkedin_url", "personlinkedinurl", "linkedin", "person_linkedin_url",
    "organization_linkedin_url", "companylinkedinurl", "linkedin_profile",
    "li_url", "linkedin_link",
  ],
  phone: [
    "phone", "phone_number", "phonenumber", "mobile", "mobile_phone",
    "direct_phone", "contact_phone", "work_phone", "cell",
  ],
  employee_count: [
    "employee_count", "employees", "company_size", "organization_num_employees",
    "num_employees", "headcount", "number_of_employees", "team_size",
    "company_headcount", "org_size", "size",
  ],
  revenue: [
    "revenue", "annual_revenue", "organization_revenue", "estimated_revenue",
    "company_revenue", "arr", "annual_revenue_estimate",
  ],
  funding_stage: [
    "funding_stage", "last_funding_type", "funding_round", "latest_funding",
    "funding", "investment_stage", "round", "series",
  ],
  funding_amount: [
    "funding_amount", "last_funding_amount", "total_funding",
    "raised", "total_raised", "funding_total",
  ],
  youtube_url: ["youtube_url", "youtube", "youtube_channel", "yt_url"],
  twitter_url: [
    "twitter_url", "twitter", "twitter_handle", "x_url", "x_handle",
    "twitter_profile",
  ],
  follower_count: [
    "creator_follower_count", "follower_count", "followers",
    "subscriber_count", "subscribers", "audience_size", "following",
  ],
  agency_type: ["agency_type", "agency_category", "business_model"],
  services_offered: ["services_offered", "services", "offerings", "capabilities"],
  name: [
    "name", "person_name", "first_name", "firstname", "full_name",
    "fullname", "contact_name",
  ],
  last_name: ["last_name", "lastname", "surname"],
  hiring_signal: ["hiring_signal", "is_hiring", "hiring", "open_roles", "job_openings"],
  launch_signal: ["launch_signal", "recently_launched", "launch", "launch_date"],
  ai_signal: ["ai_signal", "uses_ai", "ai_adoption", "tech_stack"],
  growth_signal: ["growth_signal", "recent_growth", "growth", "growth_rate", "yoy_growth"],
};

/**
 * Resolve a canonical field name to the actual column name present in lead data.
 */
export function resolveColumn(
  leadData: Record<string, unknown>,
  canonical: string
): string | null {
  const candidates = COLUMN_MAP[canonical];
  if (!candidates) return null;
  const keys = Object.keys(leadData).map((k) => k.toLowerCase());
  for (const candidate of candidates) {
    const idx = keys.indexOf(candidate.toLowerCase());
    if (idx !== -1) return Object.keys(leadData)[idx];
  }
  return null;
}

function getField(leadData: Record<string, unknown>, canonical: string): unknown {
  const col = resolveColumn(leadData, canonical);
  return col ? leadData[col] : undefined;
}

function getStr(leadData: Record<string, unknown>, canonical: string): string {
  const val = getField(leadData, canonical);
  return typeof val === "string" ? val.trim() : "";
}

function getNum(leadData: Record<string, unknown>, canonical: string): number | null {
  const val = getField(leadData, canonical);
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseInt(val.replace(/[^0-9.-]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ─── Fit Score (0-100) ───

const C_LEVEL = ["ceo", "cto", "cfo", "coo", "cmo", "chief", "founder", "co-founder", "president"];
const VP_LEVEL = ["vp", "vice president", "svp", "evp", "head of"];
const DIR_LEVEL = ["director", "sr. director", "senior director"];
const MGR_LEVEL = ["manager", "sr. manager", "senior manager"];

export function computeFitScore(
  leadData: Record<string, unknown>,
  filters: ICPSegmentFilters
): number {
  let score = 0;
  const title = getStr(leadData, "title").toLowerCase();
  const industry = getStr(leadData, "industry").toLowerCase();
  const country = getStr(leadData, "country").toLowerCase();
  const state = getStr(leadData, "state").toLowerCase();
  const city = getStr(leadData, "city").toLowerCase();
  const empCount = getNum(leadData, "employee_count");

  // Title match
  if (filters.titles_include.length > 0) {
    const titleLower = title;
    if (filters.titles_include.some((t) => titleLower.includes(t.toLowerCase()))) {
      if (C_LEVEL.some((t) => titleLower.includes(t))) score += 35;
      else if (VP_LEVEL.some((t) => titleLower.includes(t))) score += 25;
      else if (DIR_LEVEL.some((t) => titleLower.includes(t))) score += 15;
      else if (MGR_LEVEL.some((t) => titleLower.includes(t))) score += 8;
      else score += 20; // Generic title match
    }
  } else {
    // No title filter — score based on seniority
    if (C_LEVEL.some((t) => title.includes(t))) score += 35;
    else if (VP_LEVEL.some((t) => title.includes(t))) score += 25;
    else if (DIR_LEVEL.some((t) => title.includes(t))) score += 15;
    else if (MGR_LEVEL.some((t) => title.includes(t))) score += 8;
  }

  // Title exclude penalty
  if (
    filters.titles_exclude.length > 0 &&
    filters.titles_exclude.some((t) => title.includes(t.toLowerCase()))
  ) {
    score -= 50;
  }

  // Industry match
  if (filters.industries_include.length > 0) {
    if (filters.industries_include.some((i) => industry.includes(i.toLowerCase()))) {
      score += 20;
    }
  }

  // Industry exclude
  if (
    filters.industries_exclude.length > 0 &&
    filters.industries_exclude.some((i) => industry.includes(i.toLowerCase()))
  ) {
    score -= 30;
  }

  // Company size
  if (filters.employee_count_range && empCount !== null) {
    const [min, max] = filters.employee_count_range;
    if (empCount >= min && empCount <= max) {
      score += 15;
    }
  }

  // Geo match
  if (filters.countries.length > 0) {
    if (filters.countries.some((c) => country.includes(c.toLowerCase()))) score += 5;
  }
  if (filters.states.length > 0) {
    if (filters.states.some((s) => state.includes(s.toLowerCase()))) score += 3;
  }
  if (filters.cities.length > 0) {
    if (filters.cities.some((c) => city.includes(c.toLowerCase()))) score += 2;
  }

  return Math.min(100, Math.max(0, score));
}

// ─── Urgency Score (0-100) ───

export function computeUrgencyScore(leadData: Record<string, unknown>): number {
  let score = 0;
  let hasAnySignal = false;

  const hiring = getStr(leadData, "hiring_signal").toLowerCase();
  if (hiring && hiring !== "false" && hiring !== "0" && hiring !== "no") {
    score += 25;
    hasAnySignal = true;
  }

  const launch = getStr(leadData, "launch_signal").toLowerCase();
  if (launch && launch !== "false" && launch !== "0" && launch !== "no") {
    score += 25;
    hasAnySignal = true;
  }

  const fundingStage = getStr(leadData, "funding_stage").toLowerCase();
  if (fundingStage && fundingStage !== "unknown" && fundingStage !== "") {
    score += 30;
    hasAnySignal = true;
  }

  const ai = getStr(leadData, "ai_signal").toLowerCase();
  if (ai && ai !== "false" && ai !== "0" && ai !== "no") {
    score += 15;
    hasAnySignal = true;
  }

  const growth = getStr(leadData, "growth_signal").toLowerCase();
  if (growth && growth !== "false" && growth !== "0" && growth !== "no") {
    score += 20;
    hasAnySignal = true;
  }

  if (!hasAnySignal) {
    score = 20; // Base score when no signals
  }

  return Math.min(100, Math.max(0, score));
}

// ─── Budget Score (0-100) ───

const FUNDING_STAGE_SCORES: Record<string, number> = {
  "pre-seed": 40, "pre_seed": 40, "preseed": 40, "angel": 40,
  "seed": 55,
  "series_a": 75, "series a": 75, "a": 75,
  "series_b": 90, "series b": 90, "b": 90,
  "series_c": 95, "series c": 95, "c": 95,
  "series_d": 95, "series d": 95, "d": 95,
  "ipo": 95, "public": 95,
};

export function computeBudgetScore(leadData: Record<string, unknown>): number {
  let score = 30; // Conservative default

  // Funding stage
  const fundingStage = getStr(leadData, "funding_stage").toLowerCase();
  if (fundingStage && FUNDING_STAGE_SCORES[fundingStage] !== undefined) {
    score = Math.max(score, FUNDING_STAGE_SCORES[fundingStage]);
  }

  // Revenue estimate
  const revenue = getNum(leadData, "revenue");
  if (revenue !== null) {
    if (revenue >= 10_000_000) score = Math.max(score, 90);
    else if (revenue >= 1_000_000) score = Math.max(score, 75);
    else if (revenue >= 100_000) score = Math.max(score, 55);
    else if (revenue > 0) score = Math.max(score, 40);
  }

  // Employee count as proxy
  const empCount = getNum(leadData, "employee_count");
  if (empCount !== null) {
    if (empCount >= 500) score = Math.max(score, 85);
    else if (empCount >= 100) score = Math.max(score, 70);
    else if (empCount >= 50) score = Math.max(score, 55);
    else if (empCount >= 10) score = Math.max(score, 45);
  }

  // Creator follower count
  const followers = getNum(leadData, "follower_count");
  if (followers !== null) {
    if (followers >= 1_000_000) score = Math.max(score, 90);
    else if (followers >= 100_000) score = Math.max(score, 75);
    else if (followers >= 10_000) score = Math.max(score, 55);
  }

  return Math.min(100, Math.max(0, score));
}

// ─── Signal Score (0-100) ───

export function computeSignalScore(
  leadData: Record<string, unknown>,
  intentSignals: IntentSignals
): number {
  let score = 0;

  for (const signal of intentSignals.positive) {
    const col = resolveColumn(leadData, signal.source_column) ?? signal.source_column;
    const val = leadData[col];
    if (val !== undefined && val !== null && val !== "" && val !== false && val !== "false" && val !== "0") {
      score += signal.points;
    }
  }

  for (const signal of intentSignals.negative) {
    const col = resolveColumn(leadData, signal.source_column) ?? signal.source_column;
    const val = leadData[col];
    if (val !== undefined && val !== null && val !== "" && val !== false && val !== "false" && val !== "0") {
      score -= Math.abs(signal.points);
    }
  }

  return Math.min(100, Math.max(0, score));
}

// ─── Composite Score & Tier ───

export function computeCompositeScore(
  fit: number,
  urgency: number,
  budget: number,
  signal: number,
  weights: ScoringWeights
): number {
  const composite =
    fit * weights.fit_weight +
    urgency * weights.urgency_weight +
    budget * weights.budget_weight +
    signal * weights.signal_weight;

  return Math.min(100, Math.max(0, Math.round(composite)));
}

export function assignTier(
  composite: number,
  fit: number
): "tier_1" | "tier_2" | "tier_3" {
  if (composite >= 75 && fit >= 70) return "tier_1";
  if (composite >= 50 && fit >= 50) return "tier_2";
  return "tier_3";
}

// ─── Full Scoring Pipeline ───

export function scoreLeadAgainstICP(
  leadData: Record<string, unknown>,
  icp: ICPDefinition
): LeadScores {
  const fit = computeFitScore(leadData, icp.filters);
  const urgency = computeUrgencyScore(leadData);
  const budget = computeBudgetScore(leadData);
  const signal = computeSignalScore(leadData, icp.intent_signals);

  const composite = computeCompositeScore(
    fit,
    urgency,
    budget,
    signal,
    icp.scoring_weights
  );

  const tier = assignTier(composite, fit);

  return { fit_score: fit, urgency_score: urgency, budget_score: budget, signal_score: signal, composite_score: composite, tier };
}

// ─── Basic filter pass check ───

export function passesBasicFilters(
  leadData: Record<string, unknown>,
  filters: ICPSegmentFilters
): boolean {
  const email = getStr(leadData, "email");
  if (!email || !email.includes("@")) return false;

  // Check disposable email domains
  const disposableDomains = ["tempmail.com", "throwaway.email", "guerrilla.com", "mailinator.com", "yopmail.com"];
  const emailDomain = email.split("@")[1]?.toLowerCase() || "";
  if (disposableDomains.includes(emailDomain)) return false;

  // Title exclusion
  const title = getStr(leadData, "title").toLowerCase();
  if (
    filters.titles_exclude.length > 0 &&
    filters.titles_exclude.some((t) => title.includes(t.toLowerCase()))
  ) {
    return false;
  }

  // Industry exclusion
  const industry = getStr(leadData, "industry").toLowerCase();
  if (
    filters.industries_exclude.length > 0 &&
    filters.industries_exclude.some((i) => industry.includes(i.toLowerCase()))
  ) {
    return false;
  }

  return true;
}
