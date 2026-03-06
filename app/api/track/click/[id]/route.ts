import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { env } from "@/lib/env";

function safeRedirectTarget(raw: string | null): string {
  if (!raw) {
    return env.APP_BASE_URL;
  }

  try {
    const decoded = decodeURIComponent(raw);
    const url = new URL(decoded);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return env.APP_BASE_URL;
    }

    return url.toString();
  } catch {
    return env.APP_BASE_URL;
  }
}

async function recordClick(
  trackingId: string,
  destination: string,
  request: NextRequest
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const queueResult = await client.query(
      `SELECT id, org_id, campaign_id, lead_id, inbox_id, step_number
       FROM outreach_send_queue
       WHERE tracking_id = $1
       LIMIT 1`,
      [trackingId]
    );

    if (queueResult.rows.length === 0) {
      await client.query("COMMIT");
      return;
    }

    const queue = queueResult.rows[0];

    await client.query(
      `INSERT INTO outreach_email_events
         (org_id, campaign_id, queue_item_id, lead_id, inbox_id, step_number, event_type, metadata)
       VALUES
         ($1, $2, $3, $4, $5, $6, 'clicked', $7::jsonb)`,
      [
        queue.org_id,
        queue.campaign_id,
        queue.id,
        queue.lead_id,
        queue.inbox_id,
        queue.step_number,
        JSON.stringify({
          destination,
          user_agent: request.headers.get("user-agent") ?? "unknown",
          clicked_at: new Date().toISOString(),
        }),
      ]
    );

    await client.query(
      `UPDATE outreach_campaigns
       SET total_clicked = total_clicked + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [queue.campaign_id]
    );

    await client.query(
      `UPDATE outreach_campaign_steps
       SET clicked = clicked + 1
       WHERE campaign_id = $1 AND step_number = $2`,
      [queue.campaign_id, queue.step_number]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Click tracking failed", error);
  } finally {
    client.release();
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const destination = safeRedirectTarget(request.nextUrl.searchParams.get("u"));

  void recordClick(id, destination, request);

  return NextResponse.redirect(destination, { status: 302 });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
