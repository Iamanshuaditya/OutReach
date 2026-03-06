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

  const campaignId = request.nextUrl.searchParams.get("campaign_id");

  try {
    const campaignsSummary = await pool.query(
      `SELECT id,
              name,
              status,
              total_sent,
              total_opened,
              total_clicked,
              total_replied,
              total_bounced,
              total_unsubscribed,
              updated_at
       FROM outreach_campaigns
       WHERE org_id = $1
         AND ($2::uuid IS NULL OR id = $2::uuid)
       ORDER BY updated_at DESC
       LIMIT 50`,
      [auth.context.orgId, campaignId]
    );

    const inboxSendCounts = await pool.query(
      `SELECT i.id AS inbox_id,
              i.email,
              COUNT(*) FILTER (WHERE q.status = 'sent')::int AS sent_count,
              COUNT(*) FILTER (WHERE q.status = 'failed')::int AS failed_count,
              COUNT(*) FILTER (WHERE q.status = 'pending')::int AS pending_count
       FROM outreach_inboxes i
       LEFT JOIN outreach_send_queue q ON q.inbox_id = i.id
       WHERE i.org_id = $1
       GROUP BY i.id, i.email
       ORDER BY sent_count DESC`,
      [auth.context.orgId]
    );

    const eventTimeline = await pool.query(
      `SELECT e.created_at,
              e.event_type,
              e.campaign_id,
              c.name AS campaign_name,
              e.inbox_id,
              i.email AS inbox_email,
              e.metadata
       FROM outreach_email_events e
       LEFT JOIN outreach_campaigns c ON c.id = e.campaign_id
       LEFT JOIN outreach_inboxes i ON i.id = e.inbox_id
       WHERE e.org_id = $1
         AND ($2::uuid IS NULL OR e.campaign_id = $2::uuid)
       ORDER BY e.created_at DESC
       LIMIT 100`,
      [auth.context.orgId, campaignId]
    );

    const failureLogs = await pool.query(
      `SELECT created_at,
              level,
              log_type,
              message,
              campaign_id,
              inbox_id,
              queue_item_id,
              metadata
       FROM outreach_operation_logs
       WHERE org_id = $1
         AND level IN ('warn', 'error')
         AND ($2::uuid IS NULL OR campaign_id = $2::uuid)
       ORDER BY created_at DESC
       LIMIT 100`,
      [auth.context.orgId, campaignId]
    );

    return NextResponse.json(
      {
        campaigns: campaignsSummary.rows,
        inboxes: inboxSendCounts.rows,
        timeline: eventTimeline.rows,
        failures: failureLogs.rows,
      },
      { headers: rateLimitHeaders(apiRate) }
    );
  } catch (error) {
    console.error("Analytics fetch failed", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}
