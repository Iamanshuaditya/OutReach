// Mock data generators + simulation engine for the outreach system
import type {
    ConnectedDomain, Inbox, Campaign, CampaignStep,
    CampaignHealthCheck, CampaignStats, WarmupLevel, SendMode,
} from './outreach-types';

// --- Deterministic helpers ---
function hashStr(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash);
}
function seeded(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 49297;
    return x - Math.floor(x);
}

// ========== MOCK DOMAINS ==========
export function getMockDomains(): ConnectedDomain[] {
    return [
        {
            id: 'dom-1',
            domain: 'outreach.acme.io',
            provider: 'google',
            connected_at: '2026-01-15T10:00:00Z',
            dns: { spf: 'valid', dkim: 'valid', dmarc: 'valid', dmarc_policy: 'reject' },
            blacklist_status: 'clean',
            domain_age_days: 420,
            health: 'excellent',
            health_score: 95,
            reputation_trend: 'stable',
            can_send: true,
            block_reason: null,
            daily_sent: 87,
            daily_limit: 200,
            inboxes: [
                makeInbox('inbox-1', 'dom-1', 'john@outreach.acme.io', 'John Miller', 'google', 'warm', 45, 50, 32, 92, 1.2, 8.5, 42),
                makeInbox('inbox-2', 'dom-1', 'sarah@outreach.acme.io', 'Sarah Chen', 'google', 'hot', 90, 60, 55, 96, 0.8, 12.1, 55),
                makeInbox('inbox-3', 'dom-1', 'outreach@outreach.acme.io', 'Acme Outreach', 'google', 'warming', 14, 30, 12, 78, 2.5, 5.2, 28),
            ],
        },
        {
            id: 'dom-2',
            domain: 'sales.growthco.com',
            provider: 'microsoft',
            connected_at: '2026-02-01T08:00:00Z',
            dns: { spf: 'valid', dkim: 'valid', dmarc: 'valid', dmarc_policy: 'quarantine' },
            blacklist_status: 'clean',
            domain_age_days: 280,
            health: 'good',
            health_score: 82,
            reputation_trend: 'improving',
            can_send: true,
            block_reason: null,
            daily_sent: 45,
            daily_limit: 120,
            inboxes: [
                makeInbox('inbox-4', 'dom-2', 'alex@sales.growthco.com', 'Alex Rivera', 'microsoft', 'warm', 60, 45, 38, 88, 1.5, 9.8, 44),
                makeInbox('inbox-5', 'dom-2', 'hello@sales.growthco.com', 'GrowthCo', 'microsoft', 'warming', 21, 25, 7, 74, 3.1, 4.5, 22),
            ],
        },
        {
            id: 'dom-3',
            domain: 'reach.startupx.dev',
            provider: 'smtp',
            connected_at: '2026-02-20T14:00:00Z',
            dns: { spf: 'valid', dkim: 'warning', dmarc: 'missing', dmarc_policy: null },
            blacklist_status: 'unknown',
            domain_age_days: 60,
            health: 'fair',
            health_score: 48,
            reputation_trend: 'stable',
            can_send: false,
            block_reason: 'DMARC record missing. Add a DMARC TXT record to enable sending.',
            daily_sent: 0,
            daily_limit: 0,
            inboxes: [
                makeInbox('inbox-6', 'dom-3', 'founders@reach.startupx.dev', 'StartupX', 'smtp', 'new', 3, 20, 0, 45, 0, 0, 0),
            ],
        },
    ];
}

function makeInbox(
    id: string, domainId: string, email: string, name: string,
    provider: 'google' | 'microsoft' | 'smtp',
    warmup: WarmupLevel, warmupDay: number,
    dailyLimit: number, dailySent: number, healthScore: number,
    bounceRate: number, replyRate: number, openRate: number,
): Inbox {
    return {
        id, domain_id: domainId, email, display_name: name, provider,
        warmup_level: warmup, warmup_day: warmupDay,
        daily_limit: dailyLimit, daily_sent: dailySent,
        health: healthScore >= 90 ? 'excellent' : healthScore >= 70 ? 'good' : healthScore >= 50 ? 'fair' : 'poor',
        health_score: healthScore,
        bounce_rate: bounceRate, reply_rate: replyRate, open_rate: openRate,
        is_active: true,
        last_sent_at: dailySent > 0 ? new Date().toISOString() : null,
        created_at: new Date(Date.now() - warmupDay * 86400000).toISOString(),
    };
}

// ========== MOCK CAMPAIGNS ==========
export function getMockCampaigns(): Campaign[] {
    return [
        {
            id: 'camp-1',
            name: 'Aviation CEO Outreach — Q1',
            status: 'active',
            send_mode: 'safe',
            created_at: '2026-02-10T10:00:00Z',
            scheduled_at: '2026-02-11T09:00:00Z',
            started_at: '2026-02-11T09:02:00Z',
            completed_at: null,
            lead_count: 450,
            lead_source: 'Giveaway Data 330k Giveaway330k1',
            steps: [
                { id: 's1', step_number: 1, type: 'email', subject_template: 'Quick question about {{company}}', body_template: '', ai_personalize: true, tone: 'founder', wait_days: 0, condition: null, sent: 312, opened: 187, replied: 28, bounced: 4 },
                { id: 's2', step_number: 2, type: 'wait', subject_template: '', body_template: '', ai_personalize: false, tone: 'direct', wait_days: 3, condition: null, sent: 0, opened: 0, replied: 0, bounced: 0 },
                { id: 's3', step_number: 3, type: 'condition', subject_template: '', body_template: '', ai_personalize: false, tone: 'direct', wait_days: 0, condition: 'no_reply', sent: 0, opened: 0, replied: 0, bounced: 0 },
                { id: 's4', step_number: 4, type: 'email', subject_template: 'Following up — {{first_name}}', body_template: '', ai_personalize: true, tone: 'friendly', wait_days: 0, condition: null, sent: 198, opened: 105, replied: 15, bounced: 2 },
                { id: 's5', step_number: 5, type: 'wait', subject_template: '', body_template: '', ai_personalize: false, tone: 'direct', wait_days: 5, condition: null, sent: 0, opened: 0, replied: 0, bounced: 0 },
                { id: 's6', step_number: 6, type: 'email', subject_template: 'Last note — thought of {{company}}', body_template: '', ai_personalize: true, tone: 'direct', wait_days: 0, condition: null, sent: 89, opened: 38, replied: 7, bounced: 1 },
            ],
            inbox_ids: ['inbox-1', 'inbox-2'],
            sending_window: { start_hour: 8, end_hour: 17, timezone: 'America/Chicago', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
            throttle: { max_per_hour_per_inbox: 8, min_interval_seconds: 180, max_interval_seconds: 420, randomize: true },
            health_check: {
                passed: true, bounce_risk_percent: 3, catch_all_percent: 12, role_accounts_percent: 5, stale_percent: 8,
                estimated_open_rate: 48, estimated_reply_rate: 9, estimated_bounce_rate: 1.2,
                risk_level: 'low', safe_to_send: 438, blocked_leads: 12,
                recommendations: ['Consider excluding catch-all emails for better deliverability'],
            },
            stats: {
                total_leads: 450, total_sent: 599, total_delivered: 592, total_opened: 330,
                total_replied: 50, total_bounced: 7, total_unsubscribed: 3,
                positive_replies: 31, credits_used: 438, credits_refunded: 7, current_step: 4,
            },
        },
        {
            id: 'camp-2',
            name: 'SaaS CFOs — Finance Tool',
            status: 'draft',
            send_mode: 'safe',
            created_at: '2026-02-28T14:00:00Z',
            scheduled_at: null, started_at: null, completed_at: null,
            lead_count: 220,
            lead_source: 'Col 50 000 Decision Makers Verified Numb',
            steps: [
                { id: 's7', step_number: 1, type: 'email', subject_template: '', body_template: '', ai_personalize: true, tone: 'direct', wait_days: 0, condition: null, sent: 0, opened: 0, replied: 0, bounced: 0 },
            ],
            inbox_ids: ['inbox-4'],
            sending_window: { start_hour: 9, end_hour: 16, timezone: 'America/New_York', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
            throttle: { max_per_hour_per_inbox: 6, min_interval_seconds: 240, max_interval_seconds: 480, randomize: true },
            health_check: null,
            stats: { total_leads: 220, total_sent: 0, total_delivered: 0, total_opened: 0, total_replied: 0, total_bounced: 0, total_unsubscribed: 0, positive_replies: 0, credits_used: 0, credits_refunded: 0, current_step: 0 },
        },
        {
            id: 'camp-3',
            name: 'Real Estate Agents — CRM Pitch',
            status: 'completed',
            send_mode: 'moderate',
            created_at: '2026-01-20T10:00:00Z',
            scheduled_at: '2026-01-21T08:00:00Z',
            started_at: '2026-01-21T08:01:00Z',
            completed_at: '2026-02-15T18:00:00Z',
            lead_count: 800,
            lead_source: 'Realtors Top 200 Usa Cities Ok Only Millio',
            steps: [
                { id: 's8', step_number: 1, type: 'email', subject_template: 'Better way to manage listings', body_template: '', ai_personalize: true, tone: 'friendly', wait_days: 0, condition: null, sent: 780, opened: 390, replied: 62, bounced: 18 },
                { id: 's9', step_number: 2, type: 'wait', subject_template: '', body_template: '', ai_personalize: false, tone: 'direct', wait_days: 4, condition: null, sent: 0, opened: 0, replied: 0, bounced: 0 },
                { id: 's10', step_number: 3, type: 'email', subject_template: 'Quick follow up', body_template: '', ai_personalize: true, tone: 'direct', wait_days: 0, condition: null, sent: 650, opened: 280, replied: 35, bounced: 8 },
            ],
            inbox_ids: ['inbox-1', 'inbox-2', 'inbox-4'],
            sending_window: { start_hour: 7, end_hour: 18, timezone: 'America/New_York', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
            throttle: { max_per_hour_per_inbox: 10, min_interval_seconds: 150, max_interval_seconds: 360, randomize: true },
            health_check: {
                passed: true, bounce_risk_percent: 5, catch_all_percent: 18, role_accounts_percent: 3, stale_percent: 12,
                estimated_open_rate: 42, estimated_reply_rate: 7, estimated_bounce_rate: 2.3,
                risk_level: 'low', safe_to_send: 780, blocked_leads: 20,
                recommendations: [],
            },
            stats: {
                total_leads: 800, total_sent: 1430, total_delivered: 1404, total_opened: 670,
                total_replied: 97, total_bounced: 26, total_unsubscribed: 8,
                positive_replies: 58, credits_used: 780, credits_refunded: 26, current_step: 3,
            },
        },
    ];
}

// ========== HEALTH CHECK GENERATOR ==========
export function generateCampaignHealthCheck(leadCount: number): CampaignHealthCheck {
    const h = hashStr(`health-${leadCount}`);
    const bounceRisk = 2 + Math.round(seeded(h) * 8);
    const catchAll = 8 + Math.round(seeded(h + 1) * 15);
    const role = 2 + Math.round(seeded(h + 2) * 8);
    const stale = 5 + Math.round(seeded(h + 3) * 15);
    const blocked = Math.round(leadCount * (bounceRisk + role) / 200);

    const riskLevel = bounceRisk > 15 ? 'critical' : bounceRisk > 10 ? 'high' : bounceRisk > 5 ? 'medium' : 'low';

    return {
        passed: bounceRisk <= 15,
        bounce_risk_percent: bounceRisk,
        catch_all_percent: catchAll,
        role_accounts_percent: role,
        stale_percent: stale,
        estimated_open_rate: 35 + Math.round(seeded(h + 4) * 25),
        estimated_reply_rate: 4 + Math.round(seeded(h + 5) * 10),
        estimated_bounce_rate: bounceRisk * 0.4,
        risk_level: riskLevel,
        safe_to_send: leadCount - blocked,
        blocked_leads: blocked,
        recommendations: [
            ...(catchAll > 15 ? ['Consider excluding catch-all domains for better deliverability'] : []),
            ...(stale > 20 ? ['Re-verify stale contacts before sending'] : []),
            ...(role > 5 ? ['Remove role-based emails (info@, admin@) to reduce bounces'] : []),
        ],
    };
}

// ========== INBOX HEALTH SCORING ==========
export function computeInboxHealthScore(inbox: Inbox): { score: number; factors: Array<{ label: string; impact: number; status: 'good' | 'warn' | 'bad' }> } {
    const factors: Array<{ label: string; impact: number; status: 'good' | 'warn' | 'bad' }> = [];
    let score = 100;

    // Bounce rate
    if (inbox.bounce_rate <= 1) { factors.push({ label: 'Bounce rate', impact: 0, status: 'good' }); }
    else if (inbox.bounce_rate <= 3) { score -= 10; factors.push({ label: 'Bounce rate', impact: -10, status: 'warn' }); }
    else { score -= 30; factors.push({ label: 'Bounce rate', impact: -30, status: 'bad' }); }

    // Reply rate
    if (inbox.reply_rate >= 8) { factors.push({ label: 'Reply rate', impact: 5, status: 'good' }); score += 5; }
    else if (inbox.reply_rate >= 4) { factors.push({ label: 'Reply rate', impact: 0, status: 'good' }); }
    else { score -= 10; factors.push({ label: 'Reply rate', impact: -10, status: 'warn' }); }

    // Warmup level
    if (inbox.warmup_level === 'hot') { factors.push({ label: 'Warmup', impact: 5, status: 'good' }); score += 5; }
    else if (inbox.warmup_level === 'warm') { factors.push({ label: 'Warmup', impact: 0, status: 'good' }); }
    else if (inbox.warmup_level === 'warming') { score -= 5; factors.push({ label: 'Warmup', impact: -5, status: 'warn' }); }
    else { score -= 15; factors.push({ label: 'Warmup', impact: -15, status: 'warn' }); }

    // Usage ratio
    const usage = inbox.daily_limit > 0 ? inbox.daily_sent / inbox.daily_limit : 0;
    if (usage > 0.9) { score -= 10; factors.push({ label: 'Near daily limit', impact: -10, status: 'warn' }); }

    return { score: Math.min(100, Math.max(0, score)), factors };
}
