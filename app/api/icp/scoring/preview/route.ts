import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/multi-tenant";
import { loadActiveICPs, loadSubSegments } from "@/lib/icp-engine/segmenter";
import { classifyLeadAllICPs } from "@/lib/icp-engine/classifier";

function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

// GET /api/icp/scoring/preview — Preview scoring on sample leads without persisting
export async function GET(request: NextRequest) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) return auth.response;

  const { orgId } = auth.context;
  const params = request.nextUrl.searchParams;

  const tableName = params.get("table");
  const icpId = params.get("icp_id");
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "20")));

  if (!tableName) {
    return NextResponse.json({ error: "table parameter is required" }, { status: 400 });
  }

  // Validate table exists
  const tableCheck = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  if (tableCheck.rows.length === 0) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  // Load ICPs
  let icps = await loadActiveICPs(orgId);
  if (icpId) {
    icps = icps.filter((icp) => icp.id === icpId);
    if (icps.length === 0) {
      return NextResponse.json({ error: "ICP not found or not active" }, { status: 404 });
    }
  }

  const subSegments = await loadSubSegments(icps.map((i) => i.id));

  // Sample leads
  const sampleResult = await pool.query(
    `SELECT * FROM ${quote(tableName)} LIMIT $1`,
    [limit]
  );

  const previews = [];

  for (const row of sampleResult.rows as Array<Record<string, unknown>>) {
    const classifications = classifyLeadAllICPs(row, icps, subSegments);

    previews.push({
      lead_id: row.id ?? null,
      email: findEmail(row),
      name: findName(row),
      title: findField(row, ["title", "job_title", "designation"]),
      company: findField(row, ["company", "company_name", "organization_name"]),
      classifications,
    });
  }

  return NextResponse.json({
    table: tableName,
    sample_size: previews.length,
    icps_evaluated: icps.map((i) => ({ id: i.id, name: i.name })),
    previews,
  });
}

function findEmail(row: Record<string, unknown>): string {
  const candidates = ["email", "emails", "email_address"];
  for (const c of candidates) {
    const key = Object.keys(row).find((k) => k.toLowerCase() === c);
    if (key && typeof row[key] === "string") return row[key] as string;
  }
  return "";
}

function findName(row: Record<string, unknown>): string {
  const candidates = ["name", "person_name", "full_name", "first_name"];
  for (const c of candidates) {
    const key = Object.keys(row).find((k) => k.toLowerCase() === c);
    if (key && typeof row[key] === "string") return row[key] as string;
  }
  return "";
}

function findField(row: Record<string, unknown>, candidates: string[]): string {
  for (const c of candidates) {
    const key = Object.keys(row).find((k) => k.toLowerCase() === c);
    if (key && typeof row[key] === "string") return row[key] as string;
  }
  return "";
}
