import pool from "@/lib/db";

// Columns to hide from the LLM to prevent credential leaks
const SENSITIVE_COLUMNS = [
  "smtp_pass",
  "smtp_user",
  "imap_host",
  "imap_port",
  "password",
  "token",
  "secret",
  "api_key",
];

interface TableSchema {
  table_name: string;
  columns: { name: string; type: string }[];
}

let schemaCache: { data: TableSchema[]; expiry: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getDBSchema(): Promise<TableSchema[]> {
  if (schemaCache && Date.now() < schemaCache.expiry) {
    return schemaCache.data;
  }

  const result = await pool.query(`
    SELECT
      t.table_name,
      json_agg(
        json_build_object('name', c.column_name, 'type', c.data_type)
        ORDER BY c.ordinal_position
      ) AS columns
    FROM information_schema.tables t
    JOIN information_schema.columns c
      ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    GROUP BY t.table_name
    ORDER BY t.table_name
  `);

  const schema: TableSchema[] = result.rows.map(
    (row: { table_name: string; columns: { name: string; type: string }[] }) => ({
      table_name: row.table_name,
      columns: row.columns.filter(
        (col) => !SENSITIVE_COLUMNS.some((s) => col.name.toLowerCase().includes(s))
      ),
    })
  );

  schemaCache = { data: schema, expiry: Date.now() + CACHE_TTL };
  return schema;
}

export function formatSchemaForPrompt(schema: TableSchema[]): string {
  // Compact format to reduce token usage — drop types, use short notation
  return schema
    .map((t) => `${t.table_name}: ${t.columns.map((c) => c.name).join(", ")}`)
    .join("\n");
}

const FORBIDDEN_PATTERNS = [
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|REPLACE)\b/i,
  /\b(INTO|SET)\b/i,
  /;\s*\S/, // multiple statements
  /--/, // SQL comments
  /\/\*/, // block comments
  /\bpg_\w+/i, // pg catalog access
  /\binformation_schema\b/i, // schema access
  /\bEXECUTE\b/i,
  /\bCOPY\b/i,
  /\bPREPARE\b/i,
];

export function validateSQL(sql: string): { valid: boolean; reason?: string } {
  const trimmed = sql.trim();

  if (!trimmed.toUpperCase().startsWith("SELECT")) {
    return { valid: false, reason: "Only SELECT queries are allowed" };
  }

  // Check for semicolons (except trailing one)
  const withoutTrailing = trimmed.replace(/;\s*$/, "");
  if (withoutTrailing.includes(";")) {
    return { valid: false, reason: "Multiple statements are not allowed" };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(withoutTrailing)) {
      return {
        valid: false,
        reason: `Forbidden pattern detected: ${pattern.source}`,
      };
    }
  }

  return { valid: true };
}

export async function executeSafeQuery(
  sql: string
): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
  const validation = validateSQL(sql);
  if (!validation.valid) {
    throw new Error(`SQL validation failed: ${validation.reason}`);
  }

  // Auto-add LIMIT if not present
  let query = sql.trim().replace(/;\s*$/, "");
  if (!/\bLIMIT\b/i.test(query)) {
    query += " LIMIT 100";
  }

  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '10s'");
    const result = await client.query(query);
    return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
  } finally {
    await client.query("SET statement_timeout = '0'");
    client.release();
  }
}
