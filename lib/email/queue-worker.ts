import { randomUUID } from "crypto";
import pool from "@/lib/db";
import { env } from "@/lib/env";
import { decryptSecret, isEncryptedSecret } from "@/lib/crypto";
import { composeEmail } from "@/lib/email/composer";
import { logOperation } from "@/lib/email/ops-logger";
import {
  sendEmail,
  type SMTPConfig,
  type SMTPErrorClass,
} from "@/lib/email/smtp-client";

type QueueItem = {
  id: string;
  org_id: string;
  campaign_id: string;
  step_number: number;
  lead_id: number | null;
  inbox_id: string;
  recipient_email: string;
  recipient_name: string | null;
  lead_payload: Record<string, unknown> | null;
  subject: string;
  body: string;
  attempts: number;
  max_attempts: number;
  tracking_id: string | null;
};

type QueueContextRow = {
  campaign_id: string;
  campaign_status: string;
  sender_name: string;
  inbox_id: string;
  inbox_email: string;
  inbox_display_name: string;
  inbox_smtp_user: string | null;
  inbox_smtp_pass_encrypted: string | null;
  inbox_daily_limit: number;
  inbox_daily_sent: number;
  domain_id: string;
  domain_smtp_host: string | null;
  domain_smtp_port: number | null;
  domain_smtp_user: string | null;
  domain_smtp_pass_encrypted: string | null;
  org_id: string;
};

export type QueueRunResult = {
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  cancelled: number;
};

function getRetryDelayMinutes(attempt: number): number {
  if (attempt <= 1) return 5;
  if (attempt === 2) return 30;
  return 120;
}

function getLeadValue(
  leadPayload: Record<string, unknown> | null,
  key: string,
  fallback = ""
): string {
  const value = leadPayload?.[key];
  return typeof value === "string" ? value : fallback;
}

function decodeSecret(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (isEncryptedSecret(value)) {
    return decryptSecret(value);
  }

  return value;
}

function shouldRetry(errorClass: SMTPErrorClass | undefined): boolean {
  return ["network", "timeout", "temporary", "rate_limit"].includes(
    errorClass ?? "unknown"
  );
}

function toNodeName(prefix: string): string {
  return `${prefix}:${process.pid}:${randomUUID().slice(0, 8)}`;
}

async function claimPendingQueue(batchSize: number): Promise<QueueItem[]> {
  const workerName = toNodeName("queue-worker");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const claimResult = await client.query(
      `WITH due AS (
         SELECT id
         FROM outreach_send_queue
         WHERE status = 'pending'
           AND COALESCE(next_attempt_at, scheduled_at) <= NOW()
           AND attempts < COALESCE(max_attempts, 3)
         ORDER BY COALESCE(next_attempt_at, scheduled_at) ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE outreach_send_queue q
       SET status = 'sending',
           attempts = q.attempts + 1,
           claimed_at = NOW(),
           claimed_by = $2,
           last_attempt_at = NOW()
       FROM due
       WHERE q.id = due.id
       RETURNING q.*`,
      [batchSize, workerName]
    );

    await client.query("COMMIT");

    return claimResult.rows as QueueItem[];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function loadQueueContext(
  campaignId: string,
  inboxId: string
): Promise<QueueContextRow | null> {
  const result = await pool.query(
    `SELECT
       c.id AS campaign_id,
       c.status AS campaign_status,
       c.sender_name,
       i.id AS inbox_id,
       i.email AS inbox_email,
       i.display_name AS inbox_display_name,
       i.smtp_user AS inbox_smtp_user,
       i.smtp_pass_encrypted AS inbox_smtp_pass_encrypted,
       i.daily_limit AS inbox_daily_limit,
       i.daily_sent AS inbox_daily_sent,
       d.id AS domain_id,
       d.smtp_host AS domain_smtp_host,
       d.smtp_port AS domain_smtp_port,
       d.smtp_user AS domain_smtp_user,
       d.smtp_pass_encrypted AS domain_smtp_pass_encrypted,
       c.org_id
     FROM outreach_campaigns c
     JOIN outreach_inboxes i ON i.id = $2 AND i.org_id = c.org_id
     JOIN outreach_domains d ON d.id = i.domain_id
     WHERE c.id = $1`,
    [campaignId, inboxId]
  );

  return result.rows[0] ?? null;
}

async function markQueueCancelled(
  queueItemId: string,
  reason: string,
  orgId: string,
  campaignId: string,
  inboxId: string
): Promise<void> {
  await pool.query(
    `UPDATE outreach_send_queue
     SET status = 'cancelled',
         last_error = $2
     WHERE id = $1`,
    [queueItemId, reason]
  );

  await logOperation({
    orgId,
    campaignId,
    inboxId,
    queueItemId,
    logType: "queue_cancelled",
    level: "warn",
    message: reason,
  });
}

async function recordEvent(input: {
  orgId: string;
  campaignId: string;
  queueItemId: string;
  leadId: number | null;
  inboxId: string;
  stepNumber: number;
  eventType: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `INSERT INTO outreach_email_events
       (org_id, campaign_id, queue_item_id, lead_id, inbox_id, step_number, event_type, metadata)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      input.orgId,
      input.campaignId,
      input.queueItemId,
      input.leadId,
      input.inboxId,
      input.stepNumber,
      input.eventType,
      JSON.stringify(input.metadata ?? {}),
    ]
  );
}

async function handleSendSuccess(
  item: QueueItem,
  context: QueueContextRow,
  messageId: string,
  smtpMeta: Record<string, unknown>
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE outreach_send_queue
       SET status = 'sent',
           sent_at = NOW(),
           message_id = $2,
           last_error = NULL
       WHERE id = $1`,
      [item.id, messageId]
    );

    await client.query(
      `INSERT INTO outreach_email_events
         (org_id, campaign_id, queue_item_id, lead_id, inbox_id, step_number, event_type, metadata)
       VALUES
         ($1, $2, $3, $4, $5, $6, 'sent', $7::jsonb)`,
      [
        item.org_id,
        item.campaign_id,
        item.id,
        item.lead_id,
        item.inbox_id,
        item.step_number,
        JSON.stringify({ ...smtpMeta, message_id: messageId }),
      ]
    );

    await client.query(
      `UPDATE outreach_campaigns
       SET total_sent = total_sent + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [item.campaign_id]
    );

    await client.query(
      `UPDATE outreach_campaign_steps
       SET sent = sent + 1
       WHERE campaign_id = $1 AND step_number = $2`,
      [item.campaign_id, item.step_number]
    );

    await client.query(
      `UPDATE outreach_inboxes
       SET daily_sent = daily_sent + 1,
           last_sent_at = NOW()
       WHERE id = $1`,
      [context.inbox_id]
    );

    await client.query(
      `UPDATE outreach_domains
       SET daily_sent = daily_sent + 1
       WHERE id = $1`,
      [context.domain_id]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function handleSendFailure(
  item: QueueItem,
  context: QueueContextRow,
  errorMessage: string,
  errorClass?: SMTPErrorClass
): Promise<{ retried: boolean }> {
  const retry = shouldRetry(errorClass) && item.attempts < item.max_attempts;

  if (retry) {
    const delayMinutes = getRetryDelayMinutes(item.attempts);

    await pool.query(
      `UPDATE outreach_send_queue
       SET status = 'pending',
           last_error = $2,
           next_attempt_at = NOW() + make_interval(mins => $3)
       WHERE id = $1`,
      [item.id, errorMessage, delayMinutes]
    );

    await logOperation({
      orgId: item.org_id,
      campaignId: item.campaign_id,
      inboxId: item.inbox_id,
      queueItemId: item.id,
      logType: "queue_retry",
      level: "warn",
      message: "Queue item scheduled for retry",
      metadata: {
        attempts: item.attempts,
        maxAttempts: item.max_attempts,
        errorClass: errorClass ?? "unknown",
        error: errorMessage,
        retryInMinutes: delayMinutes,
      },
    });

    return { retried: true };
  }

  await pool.query(
    `UPDATE outreach_send_queue
     SET status = 'failed',
         last_error = $2
     WHERE id = $1`,
    [item.id, errorMessage]
  );

  await recordEvent({
    orgId: item.org_id,
    campaignId: item.campaign_id,
    queueItemId: item.id,
    leadId: item.lead_id,
    inboxId: item.inbox_id,
    stepNumber: item.step_number,
    eventType: "failed",
    metadata: {
      error: errorMessage,
      class: errorClass ?? "unknown",
      attempts: item.attempts,
    },
  });

  await pool.query(
    `UPDATE outreach_campaigns
     SET updated_at = NOW()
     WHERE id = $1`,
    [item.campaign_id]
  );

  await logOperation({
    orgId: item.org_id,
    campaignId: item.campaign_id,
    inboxId: item.inbox_id,
    queueItemId: item.id,
    logType: "queue_failure",
    level: "error",
    message: "Queue item failed permanently",
    metadata: {
      attempts: item.attempts,
      maxAttempts: item.max_attempts,
      errorClass: errorClass ?? "unknown",
      error: errorMessage,
    },
  });

  return { retried: false };
}

export async function processQueueBatch(batchSize = 25): Promise<QueueRunResult> {
  const items = await claimPendingQueue(batchSize);

  const result: QueueRunResult = {
    claimed: items.length,
    sent: 0,
    failed: 0,
    retried: 0,
    cancelled: 0,
  };

  for (const item of items) {
    try {
      const trackingId = item.tracking_id ?? randomUUID();
      const maxAttempts = Number(item.max_attempts ?? 3);

      if (!item.tracking_id) {
        await pool.query(
          `UPDATE outreach_send_queue
           SET tracking_id = $2
           WHERE id = $1`,
          [item.id, trackingId]
        );
      }

      const context = await loadQueueContext(item.campaign_id, item.inbox_id);

      if (!context) {
        await markQueueCancelled(
          item.id,
          "Campaign/inbox context not found",
          item.org_id,
          item.campaign_id,
          item.inbox_id
        );
        result.cancelled += 1;
        continue;
      }

      if (context.campaign_status !== "active") {
        await markQueueCancelled(
          item.id,
          `Campaign status is ${context.campaign_status}`,
          item.org_id,
          item.campaign_id,
          item.inbox_id
        );
        result.cancelled += 1;
        continue;
      }

      const suppressionResult = await pool.query(
        `SELECT 1 FROM outreach_suppression WHERE org_id = $1 AND email = $2 LIMIT 1`,
        [item.org_id, item.recipient_email.toLowerCase()]
      );

      if (suppressionResult.rows.length > 0) {
        await markQueueCancelled(
          item.id,
          "Recipient is suppressed",
          item.org_id,
          item.campaign_id,
          item.inbox_id
        );
        result.cancelled += 1;
        continue;
      }

      const leadStateResult = await pool.query(
        `SELECT status
         FROM outreach_lead_states
         WHERE org_id = $1 AND campaign_id = $2 AND email = $3`,
        [item.org_id, item.campaign_id, item.recipient_email.toLowerCase()]
      );

      if (
        leadStateResult.rows.length > 0 &&
        leadStateResult.rows[0].status !== "active"
      ) {
        await markQueueCancelled(
          item.id,
          `Lead state is ${leadStateResult.rows[0].status}`,
          item.org_id,
          item.campaign_id,
          item.inbox_id
        );
        result.cancelled += 1;
        continue;
      }

      if (context.inbox_daily_sent >= context.inbox_daily_limit) {
        await pool.query(
          `UPDATE outreach_send_queue
           SET status = 'pending',
               attempts = GREATEST(attempts - 1, 0),
               next_attempt_at = NOW() + INTERVAL '24 hours',
               last_error = 'Inbox daily cap reached'
           WHERE id = $1`,
          [item.id]
        );

        await logOperation({
          orgId: item.org_id,
          campaignId: item.campaign_id,
          inboxId: item.inbox_id,
          queueItemId: item.id,
          logType: "inbox_limit",
          level: "warn",
          message: "Inbox daily cap reached; queue item deferred",
        });

        result.retried += 1;
        continue;
      }

      const smtpHost = context.domain_smtp_host;
      const smtpPort = Number(context.domain_smtp_port ?? 587);
      const smtpUser = context.inbox_smtp_user ?? context.domain_smtp_user;
      const smtpPass =
        decodeSecret(context.inbox_smtp_pass_encrypted) ??
        decodeSecret(context.domain_smtp_pass_encrypted);

      if (!smtpHost || !smtpUser || !smtpPass) {
        const failed = await handleSendFailure(
          { ...item, max_attempts: maxAttempts },
          context,
          "SMTP configuration incomplete",
          "auth"
        );

        if (failed.retried) {
          result.retried += 1;
        } else {
          result.failed += 1;
        }
        continue;
      }

      const leadPayload = item.lead_payload ?? {};
      const leadFirstName = getLeadValue(leadPayload, "first_name");
      const leadLastName = getLeadValue(leadPayload, "last_name");
      const leadCompany = getLeadValue(leadPayload, "company");

      const composed = composeEmail({
        queueItemId: item.id,
        trackingId,
        campaignId: item.campaign_id,
        subjectTemplate: item.subject,
        bodyTemplate: item.body,
        lead: {
          first_name: leadFirstName,
          last_name: leadLastName,
          company: leadCompany,
          email: item.recipient_email,
        },
        senderName: context.sender_name || context.inbox_display_name || "",
        senderEmail: context.inbox_email,
        baseUrl: env.APP_BASE_URL,
      });

      const smtpConfig: SMTPConfig = {
        inboxId: context.inbox_id,
        host: smtpHost,
        port: smtpPort,
        user: smtpUser,
        pass: smtpPass,
        fromEmail: context.inbox_email,
        fromName: context.sender_name || context.inbox_display_name || undefined,
      };

      const sendResult = await sendEmail(smtpConfig, {
        to: item.recipient_email,
        subject: composed.subject,
        html: composed.html,
        text: composed.text,
        headers: composed.headers,
        messageId: composed.messageId,
      });

      if (!sendResult.ok) {
        const failed = await handleSendFailure(
          { ...item, max_attempts: maxAttempts },
          context,
          sendResult.error ?? "SMTP send failed",
          sendResult.classification
        );

        if (failed.retried) {
          result.retried += 1;
        } else {
          result.failed += 1;
        }
        continue;
      }

      await handleSendSuccess(
        item,
        context,
        sendResult.messageId ?? composed.messageId,
        {
          accepted: sendResult.accepted ?? [],
          rejected: sendResult.rejected ?? [],
        }
      );

      result.sent += 1;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unexpected queue worker error";

      await pool.query(
        `UPDATE outreach_send_queue
         SET status = 'failed',
             last_error = $2
         WHERE id = $1`,
        [item.id, errorMessage]
      );

      await logOperation({
        orgId: item.org_id,
        campaignId: item.campaign_id,
        inboxId: item.inbox_id,
        queueItemId: item.id,
        logType: "queue_worker_exception",
        level: "error",
        message: "Unhandled queue worker exception",
        metadata: {
          error: errorMessage,
        },
      });

      result.failed += 1;
    }
  }

  return result;
}
