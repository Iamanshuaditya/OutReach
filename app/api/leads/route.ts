import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

const COLUMN_MAP: Record<string, string[]> = {
  name: [
    "name",
    "person_name",
    "first_name",
    "firstname",
    "full_name",
    "fullname",
    "contact_name",
  ],
  last_name: ["last_name", "lastname"],
  email: ["email", "emails", "email_address", "emailaddress"],
  title: [
    "title",
    "job_title",
    "designation",
    "jobtitle",
    "position",
    "headline",
  ],
  company: [
    "company",
    "companyname",
    "companynameforemails",
    "organization_name",
    "company_name",
    "organisation",
  ],
  industry: ["industry", "sector"],
  city: ["city", "location_city"],
  state: ["state", "region", "location_state"],
  country: ["country", "location_country", "organization_country"],
  website: [
    "website",
    "organization_website_url",
    "company_website",
    "url",
    "domain",
  ],
  linkedin: [
    "linkedin_url",
    "personlinkedinurl",
    "linkedin",
    "person_linkedin_url",
    "organization_linkedin_url",
    "companylinkedinurl",
  ],
  phone: [
    "phone",
    "phone_number",
    "phonenumber",
    "mobile",
    "mobile_phone",
    "direct_phone",
  ],
};

function findColumn(
  columns: string[],
  candidates: string[]
): string | undefined {
  return columns.find((col) =>
    candidates.includes(col.toLowerCase())
  );
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const table = searchParams.get("table");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const search = searchParams.get("search") || "";
  const sortBy = searchParams.get("sortBy") || "";
  const sortOrder = searchParams.get("sortOrder") === "desc" ? "DESC" : "ASC";
  const offset = (page - 1) * limit;

  if (!table) {
    return NextResponse.json(
      { error: "Table parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Validate table exists
    const tableCheck = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    if (tableCheck.rows.length === 0) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Get column info
    const colResult = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table]
    );
    const allColumns = colResult.rows.map(
      (r: { column_name: string }) => r.column_name
    );

    // Map columns
    const mapping: Record<string, string | undefined> = {};
    for (const [key, candidates] of Object.entries(COLUMN_MAP)) {
      mapping[key] = findColumn(allColumns, candidates);
    }

    // Build name expression (handle first_name + last_name case)
    let nameExpr = "NULL";
    if (mapping.name) {
      if (mapping.last_name) {
        nameExpr = `COALESCE(${quote(mapping.name)}, '') || ' ' || COALESCE(${quote(mapping.last_name)}, '')`;
      } else {
        nameExpr = quote(mapping.name);
      }
    }

    // Build SELECT with normalized column names
    const selectParts: string[] = ["id"];
    const fieldMap: Record<string, string> = {};

    if (mapping.name) {
      selectParts.push(`${nameExpr} AS name`);
      fieldMap["name"] = nameExpr;
    }
    for (const field of [
      "email",
      "title",
      "company",
      "industry",
      "city",
      "state",
      "country",
      "website",
      "linkedin",
      "phone",
    ]) {
      if (mapping[field]) {
        selectParts.push(`${quote(mapping[field]!)} AS ${quote(field)}`);
        fieldMap[field] = quote(mapping[field]!);
      }
    }

    // Build WHERE clause for search
    let whereClause = "";
    const params: string[] = [];
    if (search) {
      const searchableFields = [
        nameExpr !== "NULL" ? nameExpr : null,
        mapping.email ? quote(mapping.email) : null,
        mapping.title ? quote(mapping.title) : null,
        mapping.company ? quote(mapping.company) : null,
        mapping.industry ? quote(mapping.industry) : null,
        mapping.city ? quote(mapping.city) : null,
      ].filter(Boolean);

      if (searchableFields.length > 0) {
        const conditions = searchableFields.map(
          (f) => `CAST(${f} AS TEXT) ILIKE $1`
        );
        whereClause = `WHERE ${conditions.join(" OR ")}`;
        params.push(`%${search}%`);
      }
    }

    // Sort
    let orderClause = "ORDER BY id ASC";
    if (sortBy && fieldMap[sortBy]) {
      orderClause = `ORDER BY ${fieldMap[sortBy]} ${sortOrder} NULLS LAST`;
    }

    // Count query
    const countQuery = `SELECT count(*) FROM ${quote(table)} ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const totalRows = parseInt(countResult.rows[0].count);

    // Data query
    const dataQuery = `SELECT ${selectParts.join(", ")} FROM ${quote(table)} ${whereClause} ${orderClause} LIMIT ${limit} OFFSET ${offset}`;
    const dataResult = await pool.query(dataQuery, params);

    // Available columns info
    const availableFields = Object.entries(mapping)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k);

    return NextResponse.json({
      data: dataResult.rows,
      totalRows,
      page,
      limit,
      totalPages: Math.ceil(totalRows / limit),
      columns: availableFields,
      allColumns,
    });
  } catch (error) {
    console.error("Error fetching leads:", error);
    return NextResponse.json(
      { error: "Failed to fetch leads" },
      { status: 500 }
    );
  }
}

function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
