import { createCipheriv, randomBytes } from "crypto";
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

const ORG_SCOPED_TABLES = [
  "outreach_domains",
  "outreach_inboxes",
  "outreach_campaigns",
  "outreach_send_queue",
  "outreach_email_events",
  "outreach_suppression",
] as const;

function parseEncryptionKey(raw: string | undefined): Buffer {
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is required to migrate plaintext credentials");
  }

  const key = raw.trim();

  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(key, "hex");
  }

  const base64 = Buffer.from(key, "base64");
  if (base64.length === 32) {
    return base64;
  }

  throw new Error(
    "ENCRYPTION_KEY must be 64-char hex or base64-encoded 32-byte key"
  );
}

function encryptSecret(plainText: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

async function tableExists(client: PoolClient, table: string): Promise<boolean> {
  const result = await client.query(`SELECT to_regclass($1) IS NOT NULL AS exists`, [table]);
  return result.rows[0]?.exists === true;
}

async function columnExists(
  client: PoolClient,
  table: string,
  column: string
): Promise<boolean> {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2
     ) AS exists`,
    [table, column]
  );

  return result.rows[0]?.exists === true;
}

async function ensureOrgScopedTable(
  client: PoolClient,
  table: string,
  defaultOrgId: string
): Promise<void> {
  if (!(await tableExists(client, table))) {
    return;
  }

  await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS org_id UUID`);
  await client.query(`UPDATE ${table} SET org_id = $1 WHERE org_id IS NULL`, [
    defaultOrgId,
  ]);
  await client.query(`ALTER TABLE ${table} ALTER COLUMN org_id SET NOT NULL`);

  const fkName = `${table}_org_id_fkey`;
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = '${fkName}'
      ) THEN
        ALTER TABLE ${table}
          ADD CONSTRAINT ${fkName}
          FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
      END IF;
    END
    $$;
  `);
}

async function migratePlaintextCredentials(
  client: PoolClient,
  key: Buffer
): Promise<{ domains: number; inboxes: number }> {
  let domainsMigrated = 0;
  let inboxesMigrated = 0;

  if (
    (await tableExists(client, "outreach_domains")) &&
    (await columnExists(client, "outreach_domains", "smtp_pass")) &&
    (await columnExists(client, "outreach_domains", "smtp_pass_encrypted"))
  ) {
    const domains = await client.query(
      `SELECT id, smtp_pass
       FROM outreach_domains
       WHERE smtp_pass IS NOT NULL
         AND smtp_pass <> ''
         AND (smtp_pass_encrypted IS NULL OR smtp_pass_encrypted = '')`
    );

    for (const row of domains.rows as Array<{ id: string; smtp_pass: string }>) {
      await client.query(
        `UPDATE outreach_domains
         SET smtp_pass_encrypted = $1,
             smtp_pass = NULL
         WHERE id = $2`,
        [encryptSecret(row.smtp_pass, key), row.id]
      );
      domainsMigrated += 1;
    }
  }

  if (
    (await tableExists(client, "outreach_inboxes")) &&
    (await columnExists(client, "outreach_inboxes", "smtp_pass")) &&
    (await columnExists(client, "outreach_inboxes", "smtp_pass_encrypted"))
  ) {
    const inboxes = await client.query(
      `SELECT id, smtp_pass
       FROM outreach_inboxes
       WHERE smtp_pass IS NOT NULL
         AND smtp_pass <> ''
         AND (smtp_pass_encrypted IS NULL OR smtp_pass_encrypted = '')`
    );

    for (const row of inboxes.rows as Array<{ id: string; smtp_pass: string }>) {
      await client.query(
        `UPDATE outreach_inboxes
         SET smtp_pass_encrypted = $1,
             smtp_pass = NULL
         WHERE id = $2`,
        [encryptSecret(row.smtp_pass, key), row.id]
      );
      inboxesMigrated += 1;
    }
  }

  return { domains: domainsMigrated, inboxes: inboxesMigrated };
}

async function migrate(): Promise<void> {
  const client = await pool.connect();
  const encryptionKey = parseEncryptionKey(process.env.ENCRYPTION_KEY);

  try {
    await client.query("BEGIN");

    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        plan TEXT DEFAULT 'free',
        monthly_email_limit INTEGER DEFAULT 1000,
        monthly_emails_sent INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        is_super_admin BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_organizations (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
        role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, org_id)
      )
    `);

    const defaultOrgResult = await client.query(
      `INSERT INTO organizations (name, slug)
       VALUES ('Default Organization', 'default-org')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );

    const defaultOrgId = defaultOrgResult.rows[0].id as string;

    if (await tableExists(client, "access_codes")) {
      await client.query(`ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS org_id UUID`);
      await client.query(`ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS role TEXT`);
      await client.query(
        `UPDATE access_codes SET org_id = $1 WHERE org_id IS NULL`,
        [defaultOrgId]
      );
      await client.query(
        `UPDATE access_codes SET role = 'member' WHERE role IS NULL OR role = ''`
      );
      await client.query(`ALTER TABLE access_codes ALTER COLUMN org_id SET NOT NULL`);

      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'access_codes_org_id_fkey'
          ) THEN
            ALTER TABLE access_codes
              ADD CONSTRAINT access_codes_org_id_fkey
              FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
          END IF;
        END
        $$;
      `);

      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'access_codes_role_check'
          ) THEN
            ALTER TABLE access_codes
              ADD CONSTRAINT access_codes_role_check
              CHECK (role IN ('owner', 'admin', 'member', 'viewer'));
          END IF;
        END
        $$;
      `);
    }

    if (await tableExists(client, "access_logs")) {
      await client.query(`ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS user_id UUID`);
      await client.query(`ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS org_id UUID`);
      await client.query(`
        UPDATE access_logs al
        SET org_id = COALESCE(ac.org_id, $1)
        FROM access_codes ac
        WHERE al.code_id = ac.id AND al.org_id IS NULL
      `, [defaultOrgId]);
      await client.query(`
        UPDATE access_logs
        SET org_id = $1
        WHERE org_id IS NULL
      `, [defaultOrgId]);

      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'access_logs_org_id_fkey'
          ) THEN
            ALTER TABLE access_logs
              ADD CONSTRAINT access_logs_org_id_fkey
              FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
          END IF;
        END
        $$;
      `);

      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'access_logs_user_id_fkey'
          ) THEN
            ALTER TABLE access_logs
              ADD CONSTRAINT access_logs_user_id_fkey
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
          END IF;
        END
        $$;
      `);
    }

    for (const table of ORG_SCOPED_TABLES) {
      await ensureOrgScopedTable(client, table, defaultOrgId);
    }

    if (await tableExists(client, "outreach_domains")) {
      await client.query(
        `ALTER TABLE outreach_domains ADD COLUMN IF NOT EXISTS smtp_pass_encrypted TEXT`
      );
      await client.query(
        `ALTER TABLE outreach_domains ADD COLUMN IF NOT EXISTS imap_pass_encrypted TEXT`
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_domains_org ON outreach_domains(org_id)`
      );
    }

    if (await tableExists(client, "outreach_inboxes")) {
      await client.query(
        `ALTER TABLE outreach_inboxes ADD COLUMN IF NOT EXISTS smtp_pass_encrypted TEXT`
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_inboxes_org ON outreach_inboxes(org_id, is_active)`
      );
    }

    if (await tableExists(client, "outreach_campaigns")) {
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_campaigns_org ON outreach_campaigns(org_id, status)`
      );
    }

    if (await tableExists(client, "outreach_send_queue")) {
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_queue_pending ON outreach_send_queue(status, scheduled_at)
         WHERE status = 'pending'`
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_queue_campaign ON outreach_send_queue(campaign_id, status)`
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_queue_inbox ON outreach_send_queue(inbox_id, status)`
      );
    }

    if (await tableExists(client, "outreach_email_events")) {
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_events_campaign ON outreach_email_events(campaign_id, event_type)`
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_events_lead ON outreach_email_events(lead_id, event_type)`
      );
    }

    if (await tableExists(client, "outreach_suppression")) {
      await client.query(
        `ALTER TABLE outreach_suppression DROP CONSTRAINT IF EXISTS outreach_suppression_email_key`
      );
      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_suppression_org_email_unique
         ON outreach_suppression(org_id, email)`
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_suppression_lookup ON outreach_suppression(org_id, email)`
      );
    }

    const migratedSecrets = await migratePlaintextCredentials(client, encryptionKey);

    await client.query("COMMIT");

    console.log("✅ MVP foundation migration completed.");
    console.log(`- Default org prepared: ${defaultOrgId}`);
    console.log(
      `- Credential migration: ${migratedSecrets.domains} domains, ${migratedSecrets.inboxes} inboxes`
    );
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
