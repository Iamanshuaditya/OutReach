import { config } from 'dotenv';
import { Pool } from 'pg';

config({ path: '.env.local' });

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ==================== DOMAINS ====================
    await client.query(`
      CREATE TABLE IF NOT EXISTS outreach_domains (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        domain TEXT NOT NULL,
        provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft', 'smtp', 'zoho', 'godaddy', 'other')),
        smtp_host TEXT,
        smtp_port INTEGER DEFAULT 587,
        smtp_user TEXT,
        smtp_pass TEXT,
        imap_host TEXT,
        imap_port INTEGER DEFAULT 993,
        spf_status TEXT DEFAULT 'checking',
        dkim_status TEXT DEFAULT 'checking',
        dmarc_status TEXT DEFAULT 'checking',
        dmarc_policy TEXT,
        blacklist_status TEXT DEFAULT 'unknown',
        domain_age_days INTEGER DEFAULT 0,
        health_score INTEGER DEFAULT 50,
        reputation_trend TEXT DEFAULT 'stable',
        can_send BOOLEAN DEFAULT false,
        block_reason TEXT,
        daily_limit INTEGER DEFAULT 0,
        daily_sent INTEGER DEFAULT 0,
        connected_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ==================== INBOXES ====================
    await client.query(`
      CREATE TABLE IF NOT EXISTS outreach_inboxes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        domain_id UUID NOT NULL REFERENCES outreach_domains(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        smtp_user TEXT,
        smtp_pass TEXT,
        warmup_level TEXT DEFAULT 'new' CHECK (warmup_level IN ('new', 'warming', 'warm', 'hot')),
        warmup_day INTEGER DEFAULT 0,
        daily_limit INTEGER DEFAULT 20,
        daily_sent INTEGER DEFAULT 0,
        health_score INTEGER DEFAULT 50,
        bounce_rate NUMERIC(5,2) DEFAULT 0,
        reply_rate NUMERIC(5,2) DEFAULT 0,
        open_rate NUMERIC(5,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        last_sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ==================== CAMPAIGNS ====================
    await client.query(`
      CREATE TABLE IF NOT EXISTS outreach_campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL DEFAULT 'Untitled Campaign',
        status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'scheduled', 'active', 'paused', 'completed', 'aborted')),
        send_mode TEXT DEFAULT 'safe' CHECK (send_mode IN ('safe', 'moderate', 'aggressive')),
        lead_source TEXT,
        lead_count INTEGER DEFAULT 0,

        -- Sending window
        window_start_hour INTEGER DEFAULT 9,
        window_end_hour INTEGER DEFAULT 17,
        window_timezone TEXT DEFAULT 'America/New_York',
        window_days TEXT[] DEFAULT ARRAY['mon','tue','wed','thu','fri'],

        -- Throttle
        max_per_hour_per_inbox INTEGER DEFAULT 8,
        min_interval_seconds INTEGER DEFAULT 180,
        max_interval_seconds INTEGER DEFAULT 420,
        randomize_interval BOOLEAN DEFAULT true,

        -- Sender context
        sender_name TEXT DEFAULT '',
        sender_company TEXT DEFAULT '',
        product_description TEXT DEFAULT '',
        value_proposition TEXT DEFAULT '',

        -- Health check
        health_check_passed BOOLEAN,
        health_check_data JSONB,

        -- Stats
        total_sent INTEGER DEFAULT 0,
        total_delivered INTEGER DEFAULT 0,
        total_opened INTEGER DEFAULT 0,
        total_replied INTEGER DEFAULT 0,
        total_bounced INTEGER DEFAULT 0,
        total_unsubscribed INTEGER DEFAULT 0,
        positive_replies INTEGER DEFAULT 0,
        credits_used INTEGER DEFAULT 0,
        credits_refunded INTEGER DEFAULT 0,

        created_at TIMESTAMPTZ DEFAULT NOW(),
        scheduled_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ==================== CAMPAIGN STEPS ====================
    await client.query(`
      CREATE TABLE IF NOT EXISTS outreach_campaign_steps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('email', 'wait', 'condition')),
        subject_template TEXT DEFAULT '',
        body_template TEXT DEFAULT '',
        ai_personalize BOOLEAN DEFAULT true,
        tone TEXT DEFAULT 'direct',
        wait_days INTEGER DEFAULT 0,
        condition TEXT,
        sent INTEGER DEFAULT 0,
        opened INTEGER DEFAULT 0,
        replied INTEGER DEFAULT 0,
        bounced INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ==================== CAMPAIGN INBOXES (junction) ====================
    await client.query(`
      CREATE TABLE IF NOT EXISTS outreach_campaign_inboxes (
        campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
        inbox_id UUID NOT NULL REFERENCES outreach_inboxes(id) ON DELETE CASCADE,
        PRIMARY KEY (campaign_id, inbox_id)
      );
    `);

    // ==================== SEND QUEUE ====================
    await client.query(`
      CREATE TABLE IF NOT EXISTS outreach_send_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL,
        lead_id INTEGER,
        inbox_id UUID REFERENCES outreach_inboxes(id),
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
        scheduled_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ==================== EMAIL EVENTS ====================
    await client.query(`
      CREATE TABLE IF NOT EXISTS outreach_email_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID REFERENCES outreach_campaigns(id),
        lead_id INTEGER,
        inbox_id UUID REFERENCES outreach_inboxes(id),
        step_number INTEGER,
        event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'delivered', 'opened', 'replied', 'bounced', 'unsubscribed', 'complained')),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ==================== SUPPRESSION LIST ====================
    await client.query(`
      CREATE TABLE IF NOT EXISTS outreach_suppression (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        reason TEXT DEFAULT 'bounced',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully!');
    console.log('Tables created: outreach_domains, outreach_inboxes, outreach_campaigns, outreach_campaign_steps, outreach_campaign_inboxes, outreach_send_queue, outreach_email_events, outreach_suppression');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
