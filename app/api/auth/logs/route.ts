import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import pool from "@/lib/db";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const { payload } = await jwtVerify(token, secret);

    if (payload.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pool.query(
    `SELECT al.id, al.name, al.ip_address, al.user_agent, al.logged_in_at,
            ac.code
     FROM access_logs al
     LEFT JOIN access_codes ac ON al.code_id = ac.id
     ORDER BY al.logged_in_at DESC
     LIMIT 100`
  );

  return NextResponse.json({ logs: result.rows });
}
