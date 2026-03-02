// LeadBase scoring and enrichment engine
// Generates realistic enrichment data for leads using deterministic hashing

import type { Lead, EnrichedLead, ProofTrailEntry, HealthReport, LeadInsight } from './types';

// Simple deterministic hash from string
function hashStr(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

// Deterministic random from seed
function seededRandom(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 49297;
    return x - Math.floor(x);
}

const DISPOSABLE_DOMAINS = ['tempmail.com', 'throwaway.email', 'guerrilla.com', 'mailinator.com'];
const ROLE_PREFIXES = ['info@', 'admin@', 'support@', 'sales@', 'contact@', 'hello@', 'team@'];
const CATCH_ALL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com'];

function getEmailDomain(email: string): string {
    return email.split('@')[1] || '';
}

function isRoleAccount(email: string): boolean {
    return ROLE_PREFIXES.some(prefix => email.toLowerCase().startsWith(prefix));
}

function isDisposable(email: string): boolean {
    const domain = getEmailDomain(email);
    return DISPOSABLE_DOMAINS.includes(domain);
}

function isCatchAll(email: string): boolean {
    const domain = getEmailDomain(email);
    return CATCH_ALL_DOMAINS.includes(domain);
}

export function computeEmailConfidence(lead: Lead): number {
    const email = String(lead.email || '').trim();
    if (!email || !email.includes('@')) return 0;

    const h = hashStr(email);
    let base = 60 + (seededRandom(h) * 40); // 60–100 base

    // Penalties
    if (isDisposable(email)) base -= 50;
    if (isRoleAccount(email)) base -= 20;
    if (isCatchAll(email)) base -= 15;

    // Bonuses
    const hasName = !!lead.name && String(lead.name).trim().length > 1;
    const hasCompany = !!lead.company && String(lead.company).trim().length > 1;
    const hasTitle = !!lead.title && String(lead.title).trim().length > 1;
    if (hasName) base += 5;
    if (hasCompany) base += 5;
    if (hasTitle) base += 5;

    return Math.min(100, Math.max(0, Math.round(base)));
}

export function computeVerificationStatus(lead: Lead): EnrichedLead['email_verification_status'] {
    const email = String(lead.email || '').trim();
    if (!email || !email.includes('@')) return 'unverified';
    if (isDisposable(email)) return 'disposable';
    if (isRoleAccount(email)) return 'role';
    if (isCatchAll(email)) return 'catch-all';

    const h = hashStr(email);
    const r = seededRandom(h + 1);
    if (r > 0.85) return 'unverified';
    if (r > 0.95) return 'invalid';
    return 'verified';
}

export function computeFreshness(lead: Lead): { date: string | null; daysAgo: number | null } {
    const h = hashStr(String(lead.id) + String(lead.email || ''));
    const daysAgo = Math.round(seededRandom(h + 2) * 120); // 0-120 days
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return { date: date.toISOString(), daysAgo };
}

export function computeICPFit(lead: Lead): number {
    let score = 50;
    const title = String(lead.title || '').toLowerCase();
    const company = String(lead.company || '').toLowerCase();

    // Title based scoring
    const cLevelTitles = ['ceo', 'cto', 'cfo', 'coo', 'cmo', 'chief', 'founder', 'co-founder', 'president'];
    const vpTitles = ['vp', 'vice president', 'svp', 'evp', 'head of'];
    const directorTitles = ['director', 'sr. director', 'senior director'];
    const managerTitles = ['manager', 'sr. manager', 'senior manager'];

    if (cLevelTitles.some(t => title.includes(t))) score += 35;
    else if (vpTitles.some(t => title.includes(t))) score += 25;
    else if (directorTitles.some(t => title.includes(t))) score += 15;
    else if (managerTitles.some(t => title.includes(t))) score += 8;

    if (company.length > 2) score += 5;
    if (lead.linkedin) score += 5;

    return Math.min(100, Math.max(0, score));
}

export function computeLeadScore(confidence: number, icpFit: number, daysAgo: number | null, saturation: number): {
    score: number;
    bucket: 'hot' | 'warm' | 'cold';
} {
    let score = (confidence * 0.3) + (icpFit * 0.35);

    // Freshness factor
    if (daysAgo !== null) {
        if (daysAgo <= 30) score += 20;
        else if (daysAgo <= 60) score += 12;
        else if (daysAgo <= 90) score += 5;
    }

    // Saturation penalty
    score -= saturation * 0.15;

    score = Math.min(100, Math.max(0, Math.round(score)));

    let bucket: 'hot' | 'warm' | 'cold' = 'cold';
    if (score >= 70 && confidence >= 85 && icpFit >= 80) bucket = 'hot';
    else if (score >= 50 && confidence >= 70 && icpFit >= 60) bucket = 'warm';

    return { score, bucket };
}

export function computeSaturation(lead: Lead): { score: 'low' | 'medium' | 'high'; value: number } {
    const h = hashStr(String(lead.email || '') + String(lead.company || ''));
    const value = Math.round(seededRandom(h + 3) * 100);

    let score: 'low' | 'medium' | 'high' = 'low';
    if (value > 70) score = 'high';
    else if (value > 40) score = 'medium';

    return { score, value };
}

export function enrichLead(lead: Lead): EnrichedLead {
    const confidence = computeEmailConfidence(lead);
    const verificationStatus = computeVerificationStatus(lead);
    const freshness = computeFreshness(lead);
    const icpFit = computeICPFit(lead);
    const saturation = computeSaturation(lead);
    const leadScore = computeLeadScore(confidence, icpFit, freshness.daysAgo, saturation.value);

    return {
        ...lead,
        email_verification_status: verificationStatus,
        email_confidence_score: confidence,
        freshness_last_verified_at: freshness.date,
        freshness_days_ago: freshness.daysAgo,
        icp_fit_score: icpFit,
        lead_score_bucket: leadScore.bucket,
        lead_score: leadScore.score,
        saturation_score: saturation.score,
        saturation_value: saturation.value,
        suppression_status: null,
    };
}

export function generateProofTrail(lead: Lead): ProofTrailEntry[] {
    const h = hashStr(String(lead.email || '') + String(lead.id));
    const now = new Date();
    const entries: ProofTrailEntry[] = [];

    // Email verification
    const emailDays = Math.round(seededRandom(h) * 60);
    const emailDate = new Date(now);
    emailDate.setDate(emailDate.getDate() - emailDays);
    entries.push({
        field: 'email',
        method: seededRandom(h + 10) > 0.5 ? 'SMTP Verification' : 'MX Record Check',
        timestamp: emailDate.toISOString(),
        status: seededRandom(h + 11) > 0.15 ? 'verified' : 'unverified',
        confidence: computeEmailConfidence(lead),
    });

    // Job title verification
    const titleDays = Math.round(seededRandom(h + 1) * 90);
    const titleDate = new Date(now);
    titleDate.setDate(titleDate.getDate() - titleDays);
    entries.push({
        field: 'job_title',
        method: 'LinkedIn Activity Scan',
        timestamp: titleDate.toISOString(),
        status: seededRandom(h + 12) > 0.2 ? 'verified' : 'unverified',
        confidence: 60 + Math.round(seededRandom(h + 13) * 35),
    });

    // Company verification
    const compDays = Math.round(seededRandom(h + 2) * 45);
    const compDate = new Date(now);
    compDate.setDate(compDate.getDate() - compDays);
    entries.push({
        field: 'company',
        method: 'Domain & Website Check',
        timestamp: compDate.toISOString(),
        status: seededRandom(h + 14) > 0.1 ? 'verified' : 'unverified',
        confidence: 70 + Math.round(seededRandom(h + 15) * 28),
    });

    return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function generateHealthReport(leads: Lead[]): HealthReport {
    let bounceRisk = 0;
    let catchAll = 0;
    let roleAccounts = 0;
    let stale = 0;
    let fresh = 0;
    let recent = 0;
    let aging = 0;

    leads.forEach(lead => {
        const enriched = enrichLead(lead);
        if (enriched.email_confidence_score < 50) bounceRisk++;
        if (enriched.email_verification_status === 'catch-all') catchAll++;
        if (enriched.email_verification_status === 'role') roleAccounts++;
        if (enriched.freshness_days_ago !== null) {
            if (enriched.freshness_days_ago <= 30) fresh++;
            else if (enriched.freshness_days_ago <= 60) recent++;
            else if (enriched.freshness_days_ago <= 90) aging++;
            else stale++;
        }
    });

    const total = leads.length || 1;
    const bouncePercent = Math.round((bounceRisk / total) * 100);
    const catchAllPercent = Math.round((catchAll / total) * 100);
    const rolePercent = Math.round((roleAccounts / total) * 100);
    const stalePercent = Math.round((stale / total) * 100);

    let health: HealthReport['overall_health'] = 'excellent';
    if (bouncePercent > 20 || stalePercent > 30) health = 'poor';
    else if (bouncePercent > 10 || stalePercent > 20) health = 'fair';
    else if (bouncePercent > 5 || stalePercent > 10) health = 'good';

    return {
        total_leads: leads.length,
        bounce_risk_percent: bouncePercent,
        catch_all_percent: catchAllPercent,
        role_accounts_percent: rolePercent,
        stale_percent: stalePercent,
        risky_domains: Math.round(seededRandom(leads.length) * 5),
        freshness_distribution: { fresh, recent, aging, stale },
        overall_health: health,
        safe_to_send: total - bounceRisk - stale,
        recommended_daily_limit: Math.min(200, Math.round((total - bounceRisk) * 0.05)),
    };
}

export function generateLeadInsight(lead: Lead): LeadInsight {
    const name = String(lead.name || 'this contact').split(' ')[0];
    const title = String(lead.title || 'professional');
    const company = String(lead.company || 'their company');

    const angles = [
        `${name} is a ${title} at ${company} — they likely make or influence purchasing decisions in their domain.`,
        `As a ${title}, ${name} would be interested in solutions that streamline operations and drive revenue growth.`,
        `${name}'s role at ${company} suggests they're focused on scaling efficiently and reducing operational friction.`,
    ];

    const subjects = [
        `Quick question about ${company}'s growth plans`,
        `${name}, found something relevant for ${company}`,
        `Idea for ${company} — 2 min read`,
    ];

    return {
        tldr: `${title} at ${company}. Decision-maker with high likelihood of engaging on operational efficiency and growth topics.`,
        why_relevant: angles[0],
        pitch_angle: `Lead with a value-first approach. Reference specific challenges a ${title} at a company like ${company} faces. Focus on ROI and time-savings rather than features.`,
        subject_lines: subjects,
        objections: [
            { objection: "We already have a solution", rebuttal: `Understood — most ${title}s I talk to did too. The common thread is they wanted better data quality / faster results. Worth a 5-min comparison?` },
            { objection: "Not interested right now", rebuttal: `Totally fair. Would it make sense to revisit in Q2 when budgets reset? Happy to send a quick resource in the meantime.` },
            { objection: "Send me more info", rebuttal: `Absolutely — I'll send a one-pager with case studies from companies similar to ${company}. Would a 10-min walkthrough next week be helpful too?` },
        ],
    };
}
