import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/multi-tenant";
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import pool from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await requireOrgContext(request);
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

  try {
    const queueFailures = await pool.query(
      `SELECT q.id,
              q.campaign_id,
              c.name AS campaign_name,
              q.inbox_id,
              i.email AS inbox_email,
              q.recipient_email,
              q.last_error,
              q.attempts,
              q.max_attempts,
              q.created_at,
              q.last_attempt_at
       FROM outreach_send_queue q
       LEFT JOIN outreach_campaigns c ON c.id = q.campaign_id
       LEFT JOIN outreach_inboxes i ON i.id = q.inbox_id
       WHERE q.org_id = $1
         AND q.status = 'failed'
       ORDER BY q.last_attempt_at DESC NULLS LAST, q.created_at DESC
       LIMIT 200`,
      [auth.context.orgId]
    );

    const workerErrors = await pool.query(
      `SELECT id,
              created_at,
              log_type,
              level,
              message,
              campaign_id,
              inbox_id,
              queue_item_id,
              metadata
       FROM outreach_operation_logs
       WHERE org_id = $1
         AND level = 'error'
       ORDER BY created_at DESC
       LIMIT 200`,
      [auth.context.orgId]
    );

    return NextResponse.json(
      {
        queue_failures: queueFailures.rows,
        worker_errors: workerErrors.rows,
      },
      { headers: rateLimitHeaders(apiRate) }
    );
  } catch (error) {
    console.error("Failure log fetch failed", error);
    return NextResponse.json(
      { error: "Failed to fetch failure logs" },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}
