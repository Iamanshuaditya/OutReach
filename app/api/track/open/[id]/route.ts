import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

const PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=",
  "base64"
);

async function recordOpen(trackingId: string, request: NextRequest): Promise<void> {
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

    const openedResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM outreach_email_events
       WHERE queue_item_id = $1 AND event_type = 'opened'`,
      [queue.id]
    );

    const isRepeatOpen = Number(openedResult.rows[0]?.count ?? 0) > 0;

    await client.query(
      `INSERT INTO outreach_email_events
         (org_id, campaign_id, queue_item_id, lead_id, inbox_id, step_number, event_type, metadata)
       VALUES
         ($1, $2, $3, $4, $5, $6, 'opened', $7::jsonb)`,
      [
        queue.org_id,
        queue.campaign_id,
        queue.id,
        queue.lead_id,
        queue.inbox_id,
        queue.step_number,
        JSON.stringify({
          is_repeat_open: isRepeatOpen,
          user_agent: request.headers.get("user-agent") ?? "unknown",
          ip:
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            request.headers.get("x-real-ip") ??
            "unknown",
          opened_at: new Date().toISOString(),
        }),
      ]
    );

    if (!isRepeatOpen) {
      await client.query(
        `UPDATE outreach_campaigns
         SET total_opened = total_opened + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [queue.campaign_id]
      );

      await client.query(
        `UPDATE outreach_campaign_steps
         SET opened = opened + 1
         WHERE campaign_id = $1 AND step_number = $2`,
        [queue.campaign_id, queue.step_number]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Open tracking failed", error);
  } finally {
    client.release();
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  void recordOpen(id, request);

  return new NextResponse(PIXEL_GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL_GIF.byteLength),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
