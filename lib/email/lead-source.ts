import pool from "@/lib/db";

export type CampaignLead = {
  leadId: number | null;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  raw: Record<string, unknown>;
};

const LEAD_COLUMN_CANDIDATES = {
  id: ["id", "lead_id"],
  email: ["email", "emails", "email_address", "emailaddress"],
  firstName: ["first_name", "firstname", "name", "person_name", "full_name"],
  lastName: ["last_name", "lastname"],
  company: ["company", "company_name", "companyname", "organization_name"],
} as const;

function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function pickColumn(
  availableColumns: string[],
  candidates: readonly string[]
): string | null {
  const match = availableColumns.find((column) =>
    candidates.includes(column.toLowerCase())
  );

  return match ?? null;
}

async function assertTableExists(tableName: string): Promise<void> {
  const result = await pool.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );

  if (result.rows.length === 0) {
    throw new Error(`Lead source table not found: ${tableName}`);
  }
}

async function getTableColumns(tableName: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );

  return result.rows.map((row) => row.column_name as string);
}

function splitName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }

  const [firstName, ...rest] = trimmed.split(/\s+/);
  return {
    firstName,
    lastName: rest.join(" "),
  };
}

export async function loadCampaignLeads(
  tableName: string,
  limit: number
): Promise<CampaignLead[]> {
  await assertTableExists(tableName);
  const columns = await getTableColumns(tableName);

  const idColumn = pickColumn(columns, LEAD_COLUMN_CANDIDATES.id);
  const emailColumn = pickColumn(columns, LEAD_COLUMN_CANDIDATES.email);
  const firstNameColumn = pickColumn(columns, LEAD_COLUMN_CANDIDATES.firstName);
  const lastNameColumn = pickColumn(columns, LEAD_COLUMN_CANDIDATES.lastName);
  const companyColumn = pickColumn(columns, LEAD_COLUMN_CANDIDATES.company);

  if (!emailColumn) {
    throw new Error(
      `Lead source table ${tableName} is missing a recognizable email column`
    );
  }

  const selectParts = columns.map((column) => quote(column)).join(", ");

  const query = `SELECT ${selectParts} FROM ${quote(tableName)} LIMIT $1`;
  const result = await pool.query(query, [limit]);

  const leads: CampaignLead[] = [];

  for (const row of result.rows as Array<Record<string, unknown>>) {
    const emailRaw = row[emailColumn];

    if (typeof emailRaw !== "string") {
      continue;
    }

    const email = emailRaw.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      continue;
    }

    const firstRaw = firstNameColumn ? row[firstNameColumn] : null;
    const lastRaw = lastNameColumn ? row[lastNameColumn] : null;

    let firstName = typeof firstRaw === "string" ? firstRaw.trim() : "";
    let lastName = typeof lastRaw === "string" ? lastRaw.trim() : "";

    if (firstName && !lastName && firstName.includes(" ")) {
      const split = splitName(firstName);
      firstName = split.firstName;
      lastName = split.lastName;
    }

    const company =
      companyColumn && typeof row[companyColumn] === "string"
        ? (row[companyColumn] as string).trim()
        : "";

    const leadId = idColumn ? Number(row[idColumn]) : null;

    leads.push({
      leadId: Number.isFinite(leadId) ? (leadId as number) : null,
      email,
      firstName,
      lastName,
      company,
      raw: row,
    });
  }

  return leads;
}
