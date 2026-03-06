// Outreach system types for LeadBase

// ========== DOMAIN & INBOX ==========

export type DomainProvider = 'google' | 'microsoft' | 'smtp';
export type DNSStatus = 'valid' | 'warning' | 'missing' | 'checking';
export type DomainHealth = 'excellent' | 'good' | 'fair' | 'poor';

export interface ConnectedDomain {
    id: string;
    domain: string;
    provider: DomainProvider;
    connected_at: string;
    dns: {
        spf: DNSStatus;
        dkim: DNSStatus;
        dmarc: DNSStatus;
        dmarc_policy: 'none' | 'quarantine' | 'reject' | null;
    };
    blacklist_status: 'clean' | 'listed' | 'unknown';
    domain_age_days: number;
    health: DomainHealth;
    health_score: number; // 0–100
    reputation_trend: 'improving' | 'stable' | 'declining';
    can_send: boolean;
    block_reason: string | null;
    inboxes: Inbox[];
    daily_sent: number;
    daily_limit: number;
}

export type WarmupLevel = 'new' | 'warming' | 'warm' | 'hot';
export type InboxHealth = 'excellent' | 'good' | 'fair' | 'poor';

export interface Inbox {
    id: string;
    domain_id: string;
    email: string;
    display_name: string;
    provider: DomainProvider;
    warmup_level: WarmupLevel;
    warmup_day: number; // days since created
    daily_limit: number;
    daily_sent: number;
    health: InboxHealth;
    health_score: number;
    bounce_rate: number;
    reply_rate: number;
    open_rate: number;
    is_active: boolean;
    last_sent_at: string | null;
    created_at: string;
}

// ========== CAMPAIGN ==========

export type CampaignStatus = 'draft' | 'review' | 'scheduled' | 'active' | 'paused' | 'completed' | 'aborted';
export type SendMode = 'safe' | 'moderate' | 'aggressive';

export interface Campaign {
    id: string;
    name: string;
    status: CampaignStatus;
    send_mode: SendMode;
    created_at: string;
    scheduled_at: string | null;
    started_at: string | null;
    completed_at: string | null;

    // Target
    lead_count: number;
    lead_source: string; // table name or list name

    // Sequence
    steps: CampaignStep[];

    // Inbox assignment
    inbox_ids: string[];

    // Sending config
    sending_window: {
        start_hour: number; // 0-23
        end_hour: number;
        timezone: string;
        days: string[]; // ['mon','tue','wed','thu','fri']
    };
    throttle: {
        max_per_hour_per_inbox: number;
        min_interval_seconds: number;
        max_interval_seconds: number;
        randomize: boolean;
    };

    // Health gate results
    health_check: CampaignHealthCheck | null;

    // Stats
    stats: CampaignStats;
}

export interface CampaignStep {
    id: string;
    step_number: number;
    type: 'email' | 'wait' | 'condition';
    // For email steps
    subject_template: string;
    body_template: string;
    ai_personalize: boolean;
    tone: 'direct' | 'friendly' | 'founder' | 'formal';
    // For wait steps
    wait_days: number;
    // For condition steps
    condition: 'replied' | 'opened' | 'no_reply' | null;
    // Stats per step
    sent: number;
    opened: number;
    replied: number;
    bounced: number;
}

export interface CampaignHealthCheck {
    passed: boolean;
    bounce_risk_percent: number;
    catch_all_percent: number;
    role_accounts_percent: number;
    stale_percent: number;
    estimated_open_rate: number;
    estimated_reply_rate: number;
    estimated_bounce_rate: number;
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    safe_to_send: number;
    blocked_leads: number;
    recommendations: string[];
}

export interface CampaignStats {
    total_leads: number;
    total_sent: number;
    total_delivered: number;
    total_opened: number;
    total_clicked?: number;
    total_replied: number;
    total_bounced: number;
    total_unsubscribed: number;
    positive_replies: number;
    credits_used: number;
    credits_refunded: number;
    current_step: number;
}

// ========== AI EMAIL GENERATION ==========

export interface AIEmailRequest {
    lead: {
        name: string;
        title: string;
        company: string;
        industry: string;
        city: string;
        linkedin_context?: string;
        company_context?: string;
    };
    sender: {
        name: string;
        company: string;
        product_description: string;
        value_proposition: string;
    };
    tone: 'direct' | 'friendly' | 'founder' | 'formal';
    step_number: number;
    previous_emails?: string[];
    icp_context?: string;
}

export interface AIEmailResponse {
    subject: string;
    subject_variants: string[];
    body: string;
    personalized_first_line: string;
    pain_angle: string;
    cta: string;
    humanization_score: number; // 0-100
    spam_risk_score: number; // 0-100
    is_safe: boolean;
    rejection_reason: string | null;
}

// ========== ENRICHMENT ==========

export interface LeadEnrichment {
    lead_id: number;
    linkedin_headline: string;
    linkedin_summary: string;
    linkedin_recent_posts: string[];
    company_description: string;
    company_website_summary: string;
    company_funding: string | null;
    company_tech_stack: string[];
    persona_summary: string;
    pain_points: string[];
    interests: string[];
    enriched_at: string;
}

// ========== TRACKING ==========

export type EmailEventType = 'sent' | 'delivered' | 'opened' | 'replied' | 'bounced' | 'unsubscribed' | 'complained';

export interface EmailEvent {
    id: string;
    campaign_id: string;
    lead_id: number;
    inbox_id: string;
    step_number: number;
    event_type: EmailEventType;
    timestamp: string;
    metadata: Record<string, unknown>;
}

export interface ReplyClassification {
    reply_type: 'positive' | 'negative' | 'neutral' | 'out_of_office' | 'unsubscribe';
    confidence: number;
    suggested_action: 'follow_up' | 'stop' | 'reschedule' | 'remove';
}

// ========== QUEUE ==========

export type QueueItemStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';

export interface SendQueueItem {
    id: string;
    campaign_id: string;
    step_number: number;
    lead_id: number;
    inbox_id: string;
    subject: string;
    body: string;
    scheduled_at: string;
    status: QueueItemStatus;
    attempts: number;
    last_error: string | null;
    sent_at: string | null;
}
