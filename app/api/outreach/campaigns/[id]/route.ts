import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/multi-tenant";
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitHeaders,
} from "@/lib/rate-limit";

// GET — detailed campaign info with steps, inboxes, queue, activity, lead states
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  try {
    // 1. Full campaign details
    const campaignResult = await pool.query(
      `SELECT * FROM outreach_campaigns
       WHERE id = $1 AND org_id = $2`,
      [id, auth.context.orgId]
    );

    if (campaignResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404, headers: rateLimitHeaders(apiRate) }
      );
    }

    const campaign = campaignResult.rows[0];

    // 2. Steps
    const stepsResult = await pool.query(
      `SELECT * FROM outreach_campaign_steps
       WHERE campaign_id = $1
       ORDER BY step_number ASC`,
      [id]
    );

    // 3. Inbox info
    const inboxesResult = await pool.query(
      `SELECT ci.inbox_id, i.email, i.display_name, i.is_active,
              i.daily_limit, i.daily_sent, i.warmup_level, i.health_score
       FROM outreach_campaign_inboxes ci
       JOIN outreach_inboxes i ON i.id = ci.inbox_id
       WHERE ci.campaign_id = $1 AND i.org_id = $2`,
      [id, auth.context.orgId]
    );

    // 4. Queue summary: count by status
    const queueSummaryResult = await pool.query(
      `SELECT status, COUNT(*)::int AS count
       FROM outreach_send_queue
       WHERE campaign_id = $1
       GROUP BY status`,
      [id]
    );

    const queueSummary: Record<string, number> = {
      pending: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const row of queueSummaryResult.rows) {
      queueSummary[row.status as string] = row.count as number;
    }

    // 5. Queue items: last 50
    const queueItemsResult = await pool.query(
      `SELECT recipient_email, status, scheduled_at, sent_at, last_error, attempts
       FROM outreach_send_queue
       WHERE campaign_id = $1
       ORDER BY scheduled_at DESC
       LIMIT 50`,
      [id]
    );

    // 6. Activity logs: last 50
    const activityLogsResult = await pool.query(
      `SELECT *
       FROM outreach_operation_logs
       WHERE campaign_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [id]
    );

    // 7. Lead states: count by status
    const leadStatesResult = await pool.query(
      `SELECT status, COUNT(*)::int AS count
       FROM outreach_lead_states
       WHERE campaign_id = $1
       GROUP BY status`,
      [id]
    );

    const leadStates: Record<string, number> = {};
    for (const row of leadStatesResult.rows) {
      leadStates[row.status as string] = row.count as number;
    }

    return NextResponse.json(
      {
        campaign: {
          ...campaign,
          sending_window: {
            start_hour: campaign.window_start_hour,
            end_hour: campaign.window_end_hour,
            timezone: campaign.window_timezone,
            days: campaign.window_days,
          },
          stats: {
            total_leads: campaign.lead_count,
            total_sent: campaign.total_sent,
            total_delivered: campaign.total_delivered,
            total_opened: campaign.total_opened,
            total_clicked: campaign.total_clicked,
            total_replied: campaign.total_replied,
            total_bounced: campaign.total_bounced,
            total_unsubscribed: campaign.total_unsubscribed,
            positive_replies: campaign.positive_replies,
            credits_used: campaign.credits_used,
            credits_refunded: campaign.credits_refunded,
            current_step: 1,
          },
          health_check: campaign.health_check_data,
        },
        steps: stepsResult.rows,
        inboxes: inboxesResult.rows,
        queue_summary: queueSummary,
        queue_items: queueItemsResult.rows,
        activity_logs: activityLogsResult.rows,
        lead_states: leadStates,
      },
      { headers: rateLimitHeaders(apiRate) }
    );
  } catch (error) {
    console.error("Error fetching campaign details:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign details" },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}

// PUT — update campaign name, status (pause/resume), send_mode
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  try {
    const rawBody = await request.json();
    const { name, status, send_mode } = rawBody as {
      name?: string;
      status?: string;
      send_mode?: string;
    };

    // Verify campaign exists and belongs to org
    const existing = await pool.query(
      `SELECT id, status FROM outreach_campaigns
       WHERE id = $1 AND org_id = $2`,
      [id, auth.context.orgId]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404, headers: rateLimitHeaders(apiRate) }
      );
    }

    const currentStatus = existing.rows[0].status as string;

    // Validate status transitions: only active↔paused
    if (status !== undefined) {
      const validTransitions: Record<string, string[]> = {
        active: ["paused"],
        paused: ["active"],
      };

      const allowed = validTransitions[currentStatus];
      if (!allowed || !allowed.includes(status)) {
        return NextResponse.json(
          {
            error: `Cannot transition from '${currentStatus}' to '${status}'. Only active↔paused transitions are allowed.`,
          },
          { status: 400, headers: rateLimitHeaders(apiRate) }
        );
      }
    }

    // Validate send_mode
    if (send_mode !== undefined) {
      const validModes = ["safe", "normal", "aggressive"];
      if (!validModes.includes(send_mode)) {
        return NextResponse.json(
          { error: `Invalid send_mode '${send_mode}'. Must be one of: ${validModes.join(", ")}` },
          { status: 400, headers: rateLimitHeaders(apiRate) }
        );
      }
    }

    const updates: string[] = ["updated_at = NOW()"];
    const values: Array<string | number> = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }

    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (send_mode !== undefined) {
      updates.push(`send_mode = $${paramIndex++}`);
      values.push(send_mode);
    }

    if (values.length === 0) {
      return NextResponse.json(
        { error: "No fields to update. Provide at least one of: name, status, send_mode" },
        { status: 400, headers: rateLimitHeaders(apiRate) }
      );
    }

    values.push(id, auth.context.orgId);

    const result = await pool.query(
      `UPDATE outreach_campaigns
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex++} AND org_id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404, headers: rateLimitHeaders(apiRate) }
      );
    }

    return NextResponse.json(
      { campaign: result.rows[0] },
      { headers: rateLimitHeaders(apiRate) }
    );
  } catch (error) {
    console.error("Error updating campaign:", error);
    return NextResponse.json(
      { error: "Failed to update campaign" },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}
