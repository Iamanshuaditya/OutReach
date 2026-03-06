import { NextResponse } from "next/server";
import pool from "@/lib/db";

async function handleUnsubscribe(trackingId: string): Promise<{ email: string | null }> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const queueResult = await client.query(
      `SELECT id, org_id, campaign_id, lead_id, inbox_id, step_number, recipient_email
       FROM outreach_send_queue
       WHERE tracking_id = $1
       LIMIT 1`,
      [trackingId]
    );

    if (queueResult.rows.length === 0) {
      await client.query("COMMIT");
      return { email: null };
    }

    const queue = queueResult.rows[0] as {
      id: string;
      org_id: string;
      campaign_id: string;
      lead_id: number | null;
      inbox_id: string;
      step_number: number;
      recipient_email: string;
    };

    const email = queue.recipient_email.toLowerCase();

    await client.query(
      `INSERT INTO outreach_suppression
         (org_id, email, reason, source_campaign_id)
       VALUES
         ($1, $2, 'unsubscribed', $3)
       ON CONFLICT (org_id, email)
       DO UPDATE SET reason = 'unsubscribed', source_campaign_id = EXCLUDED.source_campaign_id`,
      [queue.org_id, email, queue.campaign_id]
    );

    await client.query(
      `UPDATE outreach_lead_states
       SET status = 'unsubscribed',
           last_event_at = NOW()
       WHERE org_id = $1
         AND campaign_id = $2
         AND email = $3`,
      [queue.org_id, queue.campaign_id, email]
    );

    await client.query(
      `UPDATE outreach_send_queue
       SET status = 'cancelled',
           last_error = 'Recipient unsubscribed'
       WHERE org_id = $1
         AND recipient_email = $2
         AND status = 'pending'`,
      [queue.org_id, email]
    );

    const existingEvent = await client.query(
      `SELECT 1
       FROM outreach_email_events
       WHERE queue_item_id = $1 AND event_type = 'unsubscribed'
       LIMIT 1`,
      [queue.id]
    );

    if (existingEvent.rows.length === 0) {
      await client.query(
        `INSERT INTO outreach_email_events
           (org_id, campaign_id, queue_item_id, lead_id, inbox_id, step_number, event_type, metadata)
         VALUES
           ($1, $2, $3, $4, $5, $6, 'unsubscribed', $7::jsonb)`,
        [
          queue.org_id,
          queue.campaign_id,
          queue.id,
          queue.lead_id,
          queue.inbox_id,
          queue.step_number,
          JSON.stringify({ tracking_id: trackingId, at: new Date().toISOString() }),
        ]
      );

      await client.query(
        `UPDATE outreach_campaigns
         SET total_unsubscribed = total_unsubscribed + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [queue.campaign_id]
      );
    }

    await client.query("COMMIT");

    return { email };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Unsubscribe handling failed", error);
    return { email: null };
  } finally {
    client.release();
  }
}

function renderHtml(email: string | null): string {
  const safeEmail = email ? email.replace(/[<>]/g, "") : null;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Unsubscribe</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
      .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      .card { max-width: 520px; width: 100%; background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 24px; }
      h1 { margin: 0 0 8px; font-size: 22px; }
      p { margin: 0; color: #94a3b8; line-height: 1.5; }
      .email { margin-top: 12px; color: #22d3ee; word-break: break-all; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>You are unsubscribed</h1>
        <p>You will no longer receive outreach emails from this sender.</p>
        ${safeEmail ? `<p class="email">${safeEmail}</p>` : ""}
      </div>
    </div>
  </body>
</html>`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { email } = await handleUnsubscribe(id);

  return new NextResponse(renderHtml(email), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
