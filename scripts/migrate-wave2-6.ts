import { config } from "dotenv";
import { Pool, type PoolClient } from "pg";

config({ path: ".env.local" });

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || "5432", 10),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl:
    process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: false }
      : false,
});

async function tableExists(client: PoolClient, table: string): Promise<boolean> {
  const result = await client.query(`SELECT to_regclass($1) IS NOT NULL AS exists`, [
    table,
  ]);

  return result.rows[0]?.exists === true;
}

async function addEventTypeConstraint(client: PoolClient): Promise<void> {
  await client.query(
    `ALTER TABLE outreach_email_events
     DROP CONSTRAINT IF EXISTS outreach_email_events_event_type_check`
  );

  await client.query(
    `ALTER TABLE outreach_email_events
     ADD CONSTRAINT outreach_email_events_event_type_check
     CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'unsubscribed', 'complained', 'failed'))`
  );
}

async function addSuppressionReasonConstraint(client: PoolClient): Promise<void> {
  await client.query(
    `ALTER TABLE outreach_suppression
     DROP CONSTRAINT IF EXISTS outreach_suppression_reason_check`
  );

  await client.query(
    `ALTER TABLE outreach_suppression
     ADD CONSTRAINT outreach_suppression_reason_check
     CHECK (reason IN ('bounced', 'unsubscribed', 'complained', 'invalid', 'manual', 'replied'))`
  );
}

async function migrate(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    if (await tableExists(client, "outreach_campaigns")) {
      await client.query(
        `ALTER TABLE outreach_campaigns
         ADD COLUMN IF NOT EXISTS total_clicked INTEGER DEFAULT 0,
         ADD COLUMN IF NOT EXISTS auto_paused_at TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS pause_reason TEXT,
         ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ`
      );
    }

    if (await tableExists(client, "outreach_campaign_steps")) {
      await client.query(
        `ALTER TABLE outreach_campaign_steps
         ADD COLUMN IF NOT EXISTS clicked INTEGER DEFAULT 0`
      );
    }

    if (await tableExists(client, "outreach_domains")) {
      await client.query(
        `ALTER TABLE outreach_domains
         ADD COLUMN IF NOT EXISTS imap_pass_encrypted TEXT,
         ADD COLUMN IF NOT EXISTS auth_type TEXT DEFAULT 'smtp'`
      );
    }

    if (await tableExists(client, "outreach_inboxes")) {
      await client.query(
        `ALTER TABLE outreach_inboxes
         ADD COLUMN IF NOT EXISTS last_reply_check_at TIMESTAMPTZ`
      );
    }

    if (await tableExists(client, "outreach_send_queue")) {
      await client.query(
        `ALTER TABLE outreach_send_queue
         ADD COLUMN IF NOT EXISTS tracking_id UUID DEFAULT gen_random_uuid(),
         ADD COLUMN IF NOT EXISTS message_id TEXT,
         ADD COLUMN IF NOT EXISTS recipient_email TEXT,
         ADD COLUMN IF NOT EXISTS recipient_name TEXT,
         ADD COLUMN IF NOT EXISTS lead_payload JSONB DEFAULT '{}'::jsonb,
         ADD COLUMN IF NOT EXISTS headers JSONB DEFAULT '{}'::jsonb,
         ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 3,
         ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS claimed_by TEXT,
         ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ`
      );

      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_tracking
         ON outreach_send_queue(tracking_id)`
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_queue_pending_due
         ON outreach_send_queue(status, COALESCE(next_attempt_at, scheduled_at))
         WHERE status = 'pending'`
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_queue_recipient_campaign
         ON outreach_send_queue(campaign_id, recipient_email)`
      );
    }

    if (await tableExists(client, "outreach_email_events")) {
      await client.query(
        `ALTER TABLE outreach_email_events
         ADD COLUMN IF NOT EXISTS queue_item_id UUID REFERENCES outreach_send_queue(id) ON DELETE SET NULL,
         ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE`
      );

      await addEventTypeConstraint(client);

      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_events_queue_item
         ON outreach_email_events(queue_item_id)`
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_events_org_type
         ON outreach_email_events(org_id, event_type, created_at DESC)`
      );
    }

    if (await tableExists(client, "outreach_suppression")) {
      await client.query(
        `ALTER TABLE outreach_suppression
         ADD COLUMN IF NOT EXISTS source_campaign_id UUID REFERENCES outreach_campaigns(id) ON DELETE SET NULL`
      );

      await addSuppressionReasonConstraint(client);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS outreach_lead_states (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
        lead_id INTEGER,
        email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'replied', 'unsubscribed', 'bounced', 'completed')),
        last_event_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(org_id, campaign_id, email)
      )
    `);

    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_lead_states_campaign_status
       ON outreach_lead_states(campaign_id, status)`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS outreach_operation_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
        campaign_id UUID REFERENCES outreach_campaigns(id) ON DELETE SET NULL,
        inbox_id UUID REFERENCES outreach_inboxes(id) ON DELETE SET NULL,
        queue_item_id UUID REFERENCES outreach_send_queue(id) ON DELETE SET NULL,
        log_type TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'info'
          CHECK (level IN ('info', 'warn', 'error')),
        message TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_ops_logs_org_created
       ON outreach_operation_logs(org_id, created_at DESC)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_ops_logs_queue
       ON outreach_operation_logs(queue_item_id, created_at DESC)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_ops_logs_level
       ON outreach_operation_logs(level, created_at DESC)`
    );

    await client.query("COMMIT");

    console.log("✅ Wave 2-6 migration completed successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Wave 2-6 migration failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => {
  process.exit(1);
});
