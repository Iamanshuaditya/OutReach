import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireOrgRole } from "@/lib/auth/multi-tenant";
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitHeaders,
} from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const auth = await requireOrgRole(request, ["owner", "admin"]);
  if (!auth.ok) {
    return auth.response;
  }

  const apiRate = checkRateLimit(`api:${auth.context.userId}`, RATE_LIMITS.apiUser);
  if (!apiRate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(apiRate) }
    );
  }

  const result = await pool.query(
    `SELECT al.id,
            al.name,
            al.ip_address,
            al.user_agent,
            al.logged_in_at,
            ac.code,
            u.email
     FROM access_logs al
     LEFT JOIN access_codes ac ON al.code_id = ac.id
     LEFT JOIN users u ON al.user_id = u.id
     WHERE al.org_id = $1
     ORDER BY al.logged_in_at DESC
     LIMIT 100`,
    [auth.context.orgId]
  );

  return NextResponse.json(
    { logs: result.rows },
    { headers: rateLimitHeaders(apiRate) }
  );
}
