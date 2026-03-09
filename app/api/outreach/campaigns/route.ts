import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { activateCampaign } from "@/lib/email/campaign-engine";
import { requireOrgContext } from "@/lib/auth/multi-tenant";
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import {
  campaignActivationSchema,
  campaignCreateSchema,
  campaignUpdateSchema,
  formatZodError,
} from "@/lib/validation";

function toCampaignResponse(campaign: Record<string, unknown>, steps: unknown[], inboxRows: Array<{ inbox_id: string; email: string }>) {
  return {
    ...campaign,
    steps,
    inbox_ids: inboxRows.map((row) => row.inbox_id),
    inbox_emails: inboxRows.map((row) => row.email),
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
  };
}

// GET — list all campaigns with steps
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
    const campaignsResult = await pool.query(
      `SELECT * FROM outreach_campaigns
       WHERE org_id = $1
       ORDER BY created_at DESC`,
      [auth.context.orgId]
    );

    const campaigns = [];

    for (const campaign of campaignsResult.rows) {
      const stepsResult = await pool.query(
        `SELECT * FROM outreach_campaign_steps
         WHERE campaign_id = $1
         ORDER BY step_number ASC`,
        [campaign.id]
      );

      const inboxesResult = await pool.query(
        `SELECT ci.inbox_id, i.email
         FROM outreach_campaign_inboxes ci
         JOIN outreach_inboxes i ON i.id = ci.inbox_id
         WHERE ci.campaign_id = $1 AND i.org_id = $2`,
        [campaign.id, auth.context.orgId]
      );

      campaigns.push(
        toCampaignResponse(campaign, stepsResult.rows, inboxesResult.rows)
      );
    }

    return NextResponse.json(
      { campaigns },
      { headers: rateLimitHeaders(apiRate) }
    );
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}

// POST — create a new campaign
export async function POST(request: NextRequest) {
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
    const rawBody = await request.json();
    const parsed = campaignCreateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400, headers: rateLimitHeaders(apiRate) }
      );
    }

    const {
      name,
      lead_source,
      lead_count,
      send_mode,
      sender_name,
      sender_company,
      product_description,
      value_proposition,
      window_start_hour,
      window_end_hour,
      window_timezone,
      window_days,
      max_per_hour_per_inbox,
      min_interval_seconds,
      max_interval_seconds,
      steps,
      inbox_ids,
      health_check_data,
      status,
    } = parsed.data;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      if (inbox_ids && inbox_ids.length > 0) {
        const inboxOwnership = await client.query(
          `SELECT id
           FROM outreach_inboxes
           WHERE org_id = $1 AND id = ANY($2::uuid[])`,
          [auth.context.orgId, inbox_ids]
        );

        if (inboxOwnership.rows.length !== inbox_ids.length) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "One or more inboxes do not belong to this organization" },
            { status: 400, headers: rateLimitHeaders(apiRate) }
          );
        }
      }

      const campaignResult = await client.query(
        `INSERT INTO outreach_campaigns
           (org_id, name, status, lead_source, lead_count, send_mode,
            sender_name, sender_company, product_description, value_proposition,
            window_start_hour, window_end_hour, window_timezone, window_days,
            max_per_hour_per_inbox, min_interval_seconds, max_interval_seconds,
            health_check_passed, health_check_data)
         VALUES
           ($1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10,
            $11, $12, $13, $14,
            $15, $16, $17,
            $18, $19)
         RETURNING *`,
        [
          auth.context.orgId,
          name ?? "Untitled Campaign",
          status ?? "draft",
          lead_source ?? null,
          lead_count ?? 0,
          send_mode ?? "safe",
          sender_name ?? "",
          sender_company ?? "",
          product_description ?? "",
          value_proposition ?? "",
          window_start_hour ?? 9,
          window_end_hour ?? 17,
          window_timezone ?? "America/New_York",
          window_days ?? ["mon", "tue", "wed", "thu", "fri"],
          max_per_hour_per_inbox ?? 8,
          min_interval_seconds ?? 180,
          max_interval_seconds ?? 420,
          health_check_data ? true : null,
          health_check_data ? JSON.stringify(health_check_data) : null,
        ]
      );

      const campaignId = campaignResult.rows[0].id as string;

      if (steps && steps.length > 0) {
        for (const step of steps) {
          await client.query(
            `INSERT INTO outreach_campaign_steps
               (campaign_id, step_number, type, subject_template, body_template,
                ai_personalize, tone, wait_days, condition)
             VALUES
               ($1, $2, $3, $4, $5,
                $6, $7, $8, $9)`,
            [
              campaignId,
              step.step_number,
              step.type,
              step.subject_template ?? "",
              step.body_template ?? "",
              step.ai_personalize ?? true,
              step.tone ?? "direct",
              step.wait_days ?? 0,
              step.condition ?? null,
            ]
          );
        }
      }

      if (inbox_ids && inbox_ids.length > 0) {
        for (const inboxId of inbox_ids) {
          await client.query(
            `INSERT INTO outreach_campaign_inboxes (campaign_id, inbox_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [campaignId, inboxId]
          );
        }
      }

      await client.query("COMMIT");

      return NextResponse.json(
        { campaign: campaignResult.rows[0] },
        { status: 201, headers: rateLimitHeaders(apiRate) }
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error creating campaign:", error);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}

// PUT — update campaign (status, stats, etc.)
export async function PUT(request: NextRequest) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) {
    return auth.response;
  }

  const baseRate = checkRateLimit(`api:${auth.context.userId}`, RATE_LIMITS.apiUser);
  if (!baseRate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(baseRate) }
    );
  }

  try {
    const rawBody = await request.json();
    const parsed = campaignUpdateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400, headers: rateLimitHeaders(baseRate) }
      );
    }

    const { id, status, name } = parsed.data;

    if (status === "active") {
      const activationValidation = campaignActivationSchema.safeParse({ id, status });
      if (!activationValidation.success) {
        return NextResponse.json(
          { error: formatZodError(activationValidation.error) },
          { status: 400, headers: rateLimitHeaders(baseRate) }
        );
      }

      const activationRate = checkRateLimit(
        `activate:${auth.context.userId}`,
        RATE_LIMITS.campaignActivation
      );

      if (!activationRate.allowed) {
        return NextResponse.json(
          { error: "Campaign activation rate limit exceeded" },
          { status: 429, headers: rateLimitHeaders(activationRate) }
        );
      }

      try {
        const activationResult = await activateCampaign(
          id,
          auth.context.orgId,
          auth.context.userId
        );

        const campaignResult = await pool.query(
          `SELECT * FROM outreach_campaigns WHERE id = $1 AND org_id = $2`,
          [id, auth.context.orgId]
        );

        return NextResponse.json(
          {
            campaign: campaignResult.rows[0] ?? null,
            activation: activationResult,
          },
          { headers: rateLimitHeaders(activationRate) }
        );
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Campaign activation failed",
          },
          { status: 400, headers: rateLimitHeaders(activationRate) }
        );
      }
    }

    const updates: string[] = ["updated_at = NOW()"];
    const values: Array<string | number> = [];
    let paramIndex = 1;

    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }

    if (status === "completed") {
      updates.push("completed_at = NOW()");
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
        { status: 404, headers: rateLimitHeaders(baseRate) }
      );
    }

    return NextResponse.json(
      { campaign: result.rows[0] },
      { headers: rateLimitHeaders(baseRate) }
    );
  } catch (error) {
    console.error("Error updating campaign:", error);
    return NextResponse.json(
      { error: "Failed to update campaign" },
      { status: 500, headers: rateLimitHeaders(baseRate) }
    );
  }
}

// DELETE
export async function DELETE(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Campaign ID required" },
        { status: 400, headers: rateLimitHeaders(apiRate) }
      );
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Clean up all references before deleting campaign
      await client.query(
        `DELETE FROM outreach_email_events WHERE campaign_id = $1`,
        [id]
      );
      await client.query(
        `DELETE FROM outreach_operation_logs WHERE campaign_id = $1`,
        [id]
      );
      await client.query(
        `DELETE FROM outreach_send_queue WHERE campaign_id = $1`,
        [id]
      );
      await client.query(
        `DELETE FROM outreach_lead_states WHERE campaign_id = $1`,
        [id]
      );
      await client.query(
        `DELETE FROM outreach_campaigns WHERE id = $1 AND org_id = $2`,
        [id, auth.context.orgId]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json(
      { success: true },
      { headers: rateLimitHeaders(apiRate) }
    );
  } catch (error) {
    console.error("Error deleting campaign:", error);
    return NextResponse.json(
      { error: "Failed to delete campaign" },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}
