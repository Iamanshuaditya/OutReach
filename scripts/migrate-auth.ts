import { Pool } from "pg";
import { config } from "dotenv";
config({ path: ".env.local" });

async function migrate() {
  const pool = new Pool({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || "5432"),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : false,
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Invite codes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS access_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(32) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_used_at TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN DEFAULT true
      )
    `);

    // Access logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS access_logs (
        id SERIAL PRIMARY KEY,
        code_id INTEGER REFERENCES access_codes(id),
        name VARCHAR(100) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        logged_in_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await client.query("COMMIT");
    console.log("Auth migration completed successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
