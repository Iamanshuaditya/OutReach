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
  email: ["email", "emails", "email_address", "emailaddress", "contact_email", "primary_email"],
  firstName: ["first_name", "firstname", "name", "person_name", "full_name", "fullname", "contact_name"],
  lastName: ["last_name", "lastname", "surname"],
  company: ["company", "company_name", "companyname", "organization_name", "org_name", "employer"],
  title: ["title", "job_title", "designation", "jobtitle", "position", "headline"],
  industry: ["industry", "sector", "vertical"],
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

/**
 * Load leads from a segment-based source.
 * Source format: "segment::{icp_id}::{tier}" or "segment::{icp_id}::sub::{sub_segment_id}"
 */
async function loadSegmentLeads(
  source: string,
  limit: number,
  orgId?: string
): Promise<CampaignLead[]> {
  const parts = source.split("::");
  // parts[0] = "segment", parts[1] = icp_id, parts[2] = tier or "sub", parts[3] = sub_segment_id

  const icpId = parts[1];
  if (!icpId) throw new Error("Invalid segment source: missing icp_id");

  const conditions: string[] = ["icp_id = $1"];
  const values: unknown[] = [icpId];
  let paramIdx = 2;

  // Scope to org if provided
  if (orgId) {
    conditions.push(`org_id = $${paramIdx}`);
    values.push(orgId);
    paramIdx++;
  }

  if (parts[2] === "sub" && parts[3]) {
    conditions.push(`sub_segment_id = $${paramIdx}`);
    values.push(parts[3]);
    paramIdx++;
  } else if (parts[2] && parts[2] !== "all") {
    conditions.push(`tier = $${paramIdx}`);
    values.push(parts[2]);
    paramIdx++;
  }

  // Only load leads that haven't been contacted yet
  conditions.push(`outreach_status IN ('new', 'queued')`);

  values.push(limit);
  const whereClause = conditions.join(" AND ");

  const result = await pool.query(
    `SELECT lead_id, email, lead_data, composite_score
     FROM lead_segments
     WHERE ${whereClause}
     ORDER BY composite_score DESC
     LIMIT $${paramIdx}`,
    values
  );

  const leads: CampaignLead[] = [];

  for (const row of result.rows as Array<{
    lead_id: number;
    email: string;
    lead_data: Record<string, unknown>;
    composite_score: number;
  }>) {
    const data = row.lead_data || {};

    let firstName = "";
    let lastName = "";
    const rawName = String(data.name || data.first_name || data.person_name || data.full_name || "").trim();
    const rawLast = String(data.last_name || data.lastname || "").trim();

    if (rawName && !rawLast && rawName.includes(" ")) {
      const split = splitName(rawName);
      firstName = split.firstName;
      lastName = split.lastName;
    } else {
      firstName = rawName;
      lastName = rawLast;
    }

    const company = String(data.company || data.company_name || data.organization_name || "").trim();

    const title = String(data.title || data.job_title || data.designation || "").trim();
    const industry = String(data.industry || data.sector || "").trim();

    leads.push({
      leadId: row.lead_id,
      email: row.email,
      firstName,
      lastName,
      company,
      raw: { ...data, title, industry, composite_score: row.composite_score },
    });
  }

  return leads;
}

export async function loadCampaignLeads(
  tableName: string,
  limit: number
): Promise<CampaignLead[]> {
  // Check for segment-based source
  if (tableName.startsWith("segment::")) {
    return loadSegmentLeads(tableName, limit);
  }

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
