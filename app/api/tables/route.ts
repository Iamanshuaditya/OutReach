import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT table_name,
        (xpath('/row/cnt/text()', xml_count))[1]::text::int as row_count
      FROM (
        SELECT table_name,
          query_to_xml(format('SELECT count(*) as cnt FROM %I', table_name), false, true, '') as xml_count
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ) t
      ORDER BY row_count DESC
    `);

    const total = result.rows.reduce(
      (sum: number, r: { row_count: number }) => sum + r.row_count,
      0
    );

    return NextResponse.json({ tables: result.rows, total });
  } catch (error) {
    console.error("Error fetching tables:", error);
    return NextResponse.json(
      { error: "Failed to fetch tables" },
      { status: 500 }
    );
  }
}
