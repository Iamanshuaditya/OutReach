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
  const result = await client.query(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [table]
  );
  return result.rows[0]?.exists === true;
}

async function migrate(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    // ── icp_definitions ──
    if (!(await tableExists(client, "icp_definitions"))) {
      await client.query(`
        CREATE TABLE icp_definitions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          slug TEXT NOT NULL,
          description TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'active'
            CHECK (status IN ('active', 'paused', 'archived')),
          priority INTEGER NOT NULL DEFAULT 10,

          -- Firmographic filters
          filters JSONB NOT NULL DEFAULT '{}',

          -- Scoring weights
          scoring_weights JSONB NOT NULL DEFAULT '{
            "fit_weight": 0.25,
            "urgency_weight": 0.25,
            "budget_weight": 0.25,
            "signal_weight": 0.25
          }',

          -- Intent signals
          intent_signals JSONB NOT NULL DEFAULT '{"positive":[],"negative":[]}',

          -- Offer mapping
          relevant_services TEXT[] DEFAULT '{}',
          best_offer_angle TEXT DEFAULT '',
          best_cta TEXT DEFAULT '',
          typical_budget_range TEXT DEFAULT '',
          avg_deal_size INTEGER DEFAULT 0,
          sales_cycle_days INTEGER DEFAULT 14,

          -- Messaging
          value_proposition TEXT DEFAULT '',
          likely_objections JSONB DEFAULT '[]',
          qualification_questions JSONB DEFAULT '[]',

          -- Meta
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),

          UNIQUE(org_id, slug)
        )
      `);
      console.log("  Created icp_definitions");
    } else {
      console.log("  icp_definitions already exists, skipping");
    }

    // ── icp_sub_segments ──
    if (!(await tableExists(client, "icp_sub_segments"))) {
      await client.query(`
        CREATE TABLE icp_sub_segments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          icp_id UUID NOT NULL REFERENCES icp_definitions(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          filters_override JSONB DEFAULT NULL,
          scoring_override JSONB DEFAULT NULL,
          priority INTEGER NOT NULL DEFAULT 10,
          campaign_tag TEXT DEFAULT '',
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log("  Created icp_sub_segments");
    } else {
      console.log("  icp_sub_segments already exists, skipping");
    }

    // ── lead_segments ──
    if (!(await tableExists(client, "lead_segments"))) {
      await client.query(`
        CREATE TABLE lead_segments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          source_table TEXT NOT NULL,
          lead_id INTEGER NOT NULL,
          email TEXT NOT NULL DEFAULT '',
          icp_id UUID NOT NULL REFERENCES icp_definitions(id) ON DELETE CASCADE,
          sub_segment_id UUID REFERENCES icp_sub_segments(id) ON DELETE SET NULL,

          -- Scores
          fit_score INTEGER NOT NULL DEFAULT 0,
          urgency_score INTEGER NOT NULL DEFAULT 0,
          budget_score INTEGER NOT NULL DEFAULT 0,
          signal_score INTEGER NOT NULL DEFAULT 0,
          composite_score INTEGER NOT NULL DEFAULT 0,
          tier TEXT NOT NULL DEFAULT 'tier_3'
            CHECK (tier IN ('tier_1', 'tier_2', 'tier_3')),

          -- Status
          campaign_tag TEXT DEFAULT NULL,
          outreach_status TEXT NOT NULL DEFAULT 'new'
            CHECK (outreach_status IN ('new', 'queued', 'contacted', 'replied', 'converted', 'disqualified')),

          -- Data snapshot
          lead_data JSONB NOT NULL DEFAULT '{}',
          scored_at TIMESTAMPTZ DEFAULT NOW(),
          created_at TIMESTAMPTZ DEFAULT NOW(),

          UNIQUE(org_id, source_table, lead_id, icp_id)
        )
      `);

      await client.query(`
        CREATE INDEX idx_lead_segments_org_icp_tier
        ON lead_segments(org_id, icp_id, tier)
      `);
      await client.query(`
        CREATE INDEX idx_lead_segments_org_score
        ON lead_segments(org_id, composite_score DESC)
      `);
      await client.query(`
        CREATE INDEX idx_lead_segments_org_email
        ON lead_segments(org_id, email)
      `);
      await client.query(`
        CREATE INDEX idx_lead_segments_outreach
        ON lead_segments(org_id, icp_id, outreach_status)
      `);

      console.log("  Created lead_segments with indexes");
    } else {
      console.log("  lead_segments already exists, skipping");
    }

    // ── scoring_rules ──
    if (!(await tableExists(client, "scoring_rules"))) {
      await client.query(`
        CREATE TABLE scoring_rules (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          dimension TEXT NOT NULL
            CHECK (dimension IN ('fit', 'urgency', 'budget', 'signal', 'engagement')),
          rule_type TEXT NOT NULL
            CHECK (rule_type IN ('column_match', 'column_range', 'column_exists', 'title_match', 'industry_match')),
          column_name TEXT NOT NULL DEFAULT '',
          match_value TEXT NOT NULL DEFAULT '',
          points INTEGER NOT NULL DEFAULT 0,
          applies_to UUID[] DEFAULT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await client.query(`
        CREATE INDEX idx_scoring_rules_org
        ON scoring_rules(org_id, dimension)
      `);

      console.log("  Created scoring_rules");
    } else {
      console.log("  scoring_rules already exists, skipping");
    }

    // ── email_verifications ──
    if (!(await tableExists(client, "email_verifications"))) {
      await client.query(`
        CREATE TABLE email_verifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'unknown'
            CHECK (status IN ('valid', 'invalid', 'catch_all', 'disposable', 'unknown')),
          provider TEXT DEFAULT '',
          confidence INTEGER DEFAULT 0,
          mx_found BOOLEAN DEFAULT false,
          smtp_check BOOLEAN DEFAULT false,
          verified_at TIMESTAMPTZ DEFAULT NOW(),

          UNIQUE(org_id, email)
        )
      `);

      await client.query(`
        CREATE INDEX idx_email_verifications_lookup
        ON email_verifications(org_id, email)
      `);

      console.log("  Created email_verifications");
    } else {
      console.log("  email_verifications already exists, skipping");
    }

    await client.query("COMMIT");
    console.log("\n✅ ICP segmentation migration completed successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => {
  process.exit(1);
});
