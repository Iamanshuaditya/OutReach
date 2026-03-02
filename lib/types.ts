// Lead types for the LeadBase platform

export interface Lead {
    id: number;
    name?: string;
    email?: string;
    title?: string;
    company?: string;
    industry?: string;
    city?: string;
    state?: string;
    country?: string;
    website?: string;
    linkedin?: string;
    phone?: string;
    [key: string]: string | number | null | undefined;
}

export interface EnrichedLead extends Lead {
    // Freshness & Verification
    email_verification_status: 'verified' | 'catch-all' | 'unverified' | 'invalid' | 'disposable' | 'role';
    email_confidence_score: number;
    freshness_last_verified_at: string | null;
    freshness_days_ago: number | null;

    // Lead Scoring
    icp_fit_score: number;
    lead_score_bucket: 'hot' | 'warm' | 'cold';
    lead_score: number;

    // Saturation
    saturation_score: 'low' | 'medium' | 'high';
    saturation_value: number;

    // Suppression
    suppression_status: 'active' | 'bounced' | 'unsubscribed' | 'complained' | null;
}

export interface LeadsResponse {
    data: Lead[];
    totalRows: number;
    page: number;
    limit: number;
    totalPages: number;
    columns: string[];
    allColumns: string[];
}

export interface TableInfo {
    table_name: string;
    row_count: number;
}

export interface ICPFilters {
    titles_include: string[];
    titles_exclude: string[];
    industries_include: string[];
    company_size_range: [number, number] | null;
    geo: {
        countries: string[];
        states: string[];
        cities: string[];
    };
    verification: {
        min_confidence: number;
        freshness_days_max: number;
        exclude_catch_all: boolean;
        exclude_disposable: boolean;
    };
}

export interface ICPPlaybook {
    id: string;
    name: string;
    prompt: string;
    filters: ICPFilters;
    explanation: string;
    variants: ICPVariant[];
    created_at: string;
}

export interface ICPVariant {
    id: string;
    label: string;
    filters: ICPFilters;
    explanation: string;
}

export interface HealthReport {
    total_leads: number;
    bounce_risk_percent: number;
    catch_all_percent: number;
    role_accounts_percent: number;
    stale_percent: number;
    risky_domains: number;
    freshness_distribution: {
        fresh: number;    // < 30 days
        recent: number;   // 30-60 days
        aging: number;    // 60-90 days
        stale: number;    // > 90 days
    };
    overall_health: 'excellent' | 'good' | 'fair' | 'poor';
    safe_to_send: number;
    recommended_daily_limit: number;
}

export interface LeadInsight {
    tldr: string;
    why_relevant: string;
    pitch_angle: string;
    subject_lines: string[];
    objections: Array<{ objection: string; rebuttal: string }>;
}

export interface ProofTrailEntry {
    field: string;
    method: string;
    timestamp: string;
    status: 'verified' | 'unverified' | 'failed';
    confidence: number;
}

export interface UniquePack {
    id: string;
    title: string;
    niche: string;
    description: string;
    lead_count: number;
    freshness_promise: string;
    avg_confidence: number;
    overlap_estimate: 'very_low' | 'low' | 'medium';
    price_credits: number;
    sample_leads: Lead[];
    tags: string[];
}

export interface PricingTier {
    id: string;
    name: string;
    monthly_price: number;
    credits: number;
    features: string[];
    popular?: boolean;
}

export interface BillingInfo {
    credits_remaining: number;
    credits_used_this_month: number;
    credits_refunded_this_month: number;
    next_renewal: string;
    plan: PricingTier;
    can_pause: boolean;
}

export const COLUMN_LABELS: Record<string, string> = {
    name: "Name",
    email: "Email",
    title: "Job Title",
    company: "Company",
    industry: "Industry",
    city: "City",
    state: "State",
    country: "Country",
    website: "Website",
    linkedin: "LinkedIn",
    phone: "Phone",
    email_confidence_score: "Confidence",
    lead_score_bucket: "Score",
    freshness_last_verified_at: "Freshness",
    saturation_score: "Saturation",
};
