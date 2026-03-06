import pool from "@/lib/db";
import { logOperation } from "@/lib/email/ops-logger";

export type ParsedBounce = {
  isBounce: boolean;
  isHardBounce: boolean;
  recipientEmail: string | null;
  reason: string;
};

const HARD_BOUNCE_MARKERS = [
  "user unknown",
  "no such user",
  "mailbox unavailable",
  "recipient address rejected",
  "550",
  "5.1.1",
  "5.1.0",
  "5.2.1",
  "undeliverable",
];

const SOFT_BOUNCE_MARKERS = ["421", "4.2.2", "mailbox full", "temporary", "deferred"];

function extractRecipientEmail(text: string): string | null {
  const match = text.match(
    /(?:Final-Recipient:\s*rfc822;|Original-Recipient:\s*rfc822;|for\s+<)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,})>?/
  );

  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  const fallback = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/);
  return fallback?.[0]?.toLowerCase() ?? null;
}

export function parseBounceMessage(input: {
  subject: string;
  from: string;
  body: string;
}): ParsedBounce {
  const normalized = `${input.subject}\n${input.from}\n${input.body}`.toLowerCase();

  const looksLikeBounce =
    normalized.includes("mailer-daemon") ||
    normalized.includes("postmaster") ||
    normalized.includes("delivery status notification") ||
    normalized.includes("undeliverable") ||
    normalized.includes("failure notice");

  if (!looksLikeBounce) {
    return {
      isBounce: false,
      isHardBounce: false,
      recipientEmail: null,
      reason: "not_bounce",
    };
  }

  const isHardBounce = HARD_BOUNCE_MARKERS.some((marker) =>
    normalized.includes(marker)
  );

  const isSoftBounce = SOFT_BOUNCE_MARKERS.some((marker) =>
    normalized.includes(marker)
  );

  return {
    isBounce: true,
    isHardBounce,
    recipientEmail: extractRecipientEmail(input.body),
    reason: isHardBounce ? "hard_bounce" : isSoftBounce ? "soft_bounce" : "bounce",
  };
}

export async function autoPauseCampaignOnBounceSpike(
  orgId: string,
  campaignId: string,
  threshold = 0.08
): Promise<void> {
  const statsResult = await pool.query(
    `SELECT total_sent, total_bounced, status
     FROM outreach_campaigns
     WHERE id = $1 AND org_id = $2`,
    [campaignId, orgId]
  );

  if (statsResult.rows.length === 0) {
    return;
  }

  const campaign = statsResult.rows[0] as {
    total_sent: number;
    total_bounced: number;
    status: string;
  };

  if (campaign.status !== "active") {
    return;
  }

  if (campaign.total_sent < 20) {
    return;
  }

  const bounceRate = campaign.total_bounced / Math.max(1, campaign.total_sent);
  if (bounceRate < threshold) {
    return;
  }

  await pool.query(
    `UPDATE outreach_campaigns
     SET status = 'paused',
         auto_paused_at = NOW(),
         pause_reason = $3,
         updated_at = NOW()
     WHERE id = $1 AND org_id = $2`,
    [campaignId, orgId, `Auto-paused due to bounce spike (${(bounceRate * 100).toFixed(2)}%)`]
  );

  await logOperation({
    orgId,
    campaignId,
    logType: "campaign_auto_pause",
    level: "error",
    message: "Campaign auto-paused due to bounce spike",
    metadata: {
      totalSent: campaign.total_sent,
      totalBounced: campaign.total_bounced,
      bounceRate,
      threshold,
    },
  });
}

export async function handleHardBounce(input: {
  orgId: string;
  campaignId: string;
  inboxId: string;
  queueItemId: string;
  leadId: number | null;
  stepNumber: number;
  recipientEmail: string;
  reason?: string;
}): Promise<void> {
  const reason = input.reason ?? "hard_bounce";
  const email = input.recipientEmail.toLowerCase();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO outreach_suppression
         (org_id, email, reason, source_campaign_id)
       VALUES
         ($1, $2, 'bounced', $3)
       ON CONFLICT (org_id, email)
       DO UPDATE SET reason = 'bounced', source_campaign_id = EXCLUDED.source_campaign_id`,
      [input.orgId, email, input.campaignId]
    );

    await client.query(
      `UPDATE outreach_lead_states
       SET status = 'bounced',
           last_event_at = NOW()
       WHERE org_id = $1
         AND campaign_id = $2
         AND email = $3`,
      [input.orgId, input.campaignId, email]
    );

    await client.query(
      `UPDATE outreach_send_queue
       SET status = 'cancelled',
           last_error = 'Recipient hard bounced'
       WHERE org_id = $1
         AND recipient_email = $2
         AND status = 'pending'`,
      [input.orgId, email]
    );

    await client.query(
      `INSERT INTO outreach_email_events
         (org_id, campaign_id, queue_item_id, lead_id, inbox_id, step_number, event_type, metadata)
       VALUES
         ($1, $2, $3, $4, $5, $6, 'bounced', $7::jsonb)`,
      [
        input.orgId,
        input.campaignId,
        input.queueItemId,
        input.leadId,
        input.inboxId,
        input.stepNumber,
        JSON.stringify({ reason, recipient_email: email }),
      ]
    );

    await client.query(
      `UPDATE outreach_campaigns
       SET total_bounced = total_bounced + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [input.campaignId]
    );

    await client.query(
      `UPDATE outreach_campaign_steps
       SET bounced = bounced + 1
       WHERE campaign_id = $1 AND step_number = $2`,
      [input.campaignId, input.stepNumber]
    );

    await client.query("COMMIT");

    await autoPauseCampaignOnBounceSpike(input.orgId, input.campaignId);

    await logOperation({
      orgId: input.orgId,
      campaignId: input.campaignId,
      inboxId: input.inboxId,
      queueItemId: input.queueItemId,
      logType: "hard_bounce",
      level: "warn",
      message: "Hard bounce detected and recipient suppressed",
      metadata: { recipientEmail: email, reason },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
