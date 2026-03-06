# LeadBase — Database Schema

## Tables Overview

| Table | Purpose | Row Growth |
|-------|---------|------------|
| `organizations` | Tenant accounts | Slow |
| `users` | User accounts | Slow |
| `user_organizations` | User-org membership | Slow |
| `outreach_domains` | Connected email domains | Slow |
| `outreach_inboxes` | Email sending accounts | Slow |
| `outreach_campaigns` | Campaign configurations | Moderate |
| `outreach_campaign_steps` | Sequence step definitions | Moderate |
| `outreach_campaign_inboxes` | Campaign-inbox junction | Moderate |
| `outreach_send_queue` | Pending/sent email queue | **Fast** |
| `outreach_email_events` | Open/click/bounce/reply events | **Very Fast** |
| `outreach_suppression` | Bounced/unsubscribed emails | Moderate |

---

## Schema Details

### organizations

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free',
  monthly_email_limit INTEGER DEFAULT 1000,
  monthly_emails_sent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### user_organizations

```sql
CREATE TABLE user_organizations (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  PRIMARY KEY (user_id, org_id)
);
```

### outreach_domains

```sql
CREATE TABLE outreach_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  domain TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft', 'smtp', 'zoho', 'godaddy', 'hostinger', 'other')),
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_user TEXT,
  smtp_pass_encrypted BYTEA,        -- AES-256-GCM encrypted
  imap_host TEXT,
  imap_port INTEGER DEFAULT 993,
  auth_type TEXT DEFAULT 'smtp' CHECK (auth_type IN ('smtp', 'oauth_google', 'oauth_microsoft')),
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
```

### outreach_inboxes

```sql
CREATE TABLE outreach_inboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  domain_id UUID NOT NULL REFERENCES outreach_domains(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  smtp_user TEXT,
  smtp_pass_encrypted BYTEA,        -- AES-256-GCM encrypted
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
  last_reply_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### outreach_campaigns

```sql
CREATE TABLE outreach_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL DEFAULT 'Untitled Campaign',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'scheduled', 'active', 'paused', 'completed', 'aborted')),
  send_mode TEXT DEFAULT 'safe' CHECK (send_mode IN ('safe', 'moderate', 'aggressive')),
  lead_source TEXT,
  lead_count INTEGER DEFAULT 0,
  window_start_hour INTEGER DEFAULT 9,
  window_end_hour INTEGER DEFAULT 17,
  window_timezone TEXT DEFAULT 'America/New_York',
  window_days TEXT[] DEFAULT ARRAY['mon','tue','wed','thu','fri'],
  max_per_hour_per_inbox INTEGER DEFAULT 8,
  min_interval_seconds INTEGER DEFAULT 180,
  max_interval_seconds INTEGER DEFAULT 420,
  randomize_interval BOOLEAN DEFAULT true,
  sender_name TEXT DEFAULT '',
  sender_company TEXT DEFAULT '',
  product_description TEXT DEFAULT '',
  value_proposition TEXT DEFAULT '',
  health_check_passed BOOLEAN,
  health_check_data JSONB,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
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
```

### outreach_campaign_steps

```sql
CREATE TABLE outreach_campaign_steps (
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
  clicked INTEGER DEFAULT 0,
  replied INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### outreach_send_queue

```sql
CREATE TABLE outreach_send_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  lead_id INTEGER,
  inbox_id UUID REFERENCES outreach_inboxes(id),
  tracking_id UUID DEFAULT gen_random_uuid(),
  message_id TEXT,                    -- SMTP Message-ID for reply matching
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### outreach_email_events

```sql
CREATE TABLE outreach_email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  campaign_id UUID REFERENCES outreach_campaigns(id),
  queue_item_id UUID REFERENCES outreach_send_queue(id),
  lead_id INTEGER,
  inbox_id UUID REFERENCES outreach_inboxes(id),
  step_number INTEGER,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'unsubscribed', 'complained')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### outreach_suppression

```sql
CREATE TABLE outreach_suppression (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  email TEXT NOT NULL,
  reason TEXT DEFAULT 'bounced' CHECK (reason IN ('bounced', 'unsubscribed', 'complained', 'invalid', 'manual')),
  source_campaign_id UUID REFERENCES outreach_campaigns(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, email)
);
```

---

## Required Indexes

```sql
-- Queue processing (hot path)
CREATE INDEX idx_queue_pending ON outreach_send_queue(status, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX idx_queue_campaign ON outreach_send_queue(campaign_id, status);
CREATE INDEX idx_queue_inbox ON outreach_send_queue(inbox_id, status);
CREATE INDEX idx_queue_tracking ON outreach_send_queue(tracking_id);

-- Event lookups
CREATE INDEX idx_events_campaign ON outreach_email_events(campaign_id, event_type);
CREATE INDEX idx_events_lead ON outreach_email_events(lead_id, event_type);
CREATE INDEX idx_events_queue_item ON outreach_email_events(queue_item_id);

-- Suppression checks (checked before every send)
CREATE INDEX idx_suppression_lookup ON outreach_suppression(org_id, email);

-- Org-scoped queries
CREATE INDEX idx_domains_org ON outreach_domains(org_id);
CREATE INDEX idx_inboxes_org ON outreach_inboxes(org_id, is_active);
CREATE INDEX idx_campaigns_org ON outreach_campaigns(org_id, status);
```

---

## Data Lifecycle

### Send Queue

Queue items move through states:

```
pending -> sending -> sent
                   -> failed (retry up to max_attempts)
                            -> failed (permanent, logged)

pending -> cancelled (lead unsubscribed, campaign paused, etc.)
```

### Email Events

Events are append-only. For high-volume orgs, partition by month:

```sql
-- Future: partition by created_at month
CREATE TABLE outreach_email_events_2026_03 PARTITION OF outreach_email_events
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
```

### Daily Counter Reset

`daily_sent` on domains and inboxes resets at midnight (org timezone):

```sql
-- Cron job: reset daily counters
UPDATE outreach_domains SET daily_sent = 0;
UPDATE outreach_inboxes SET daily_sent = 0;
```
