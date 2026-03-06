import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import pool from "@/lib/db";
import { decryptSecret, isEncryptedSecret } from "@/lib/crypto";
import { handleHardBounce, parseBounceMessage } from "@/lib/email/bounce-handler";
import { logOperation } from "@/lib/email/ops-logger";

type InboxReplyContext = {
  org_id: string;
  inbox_id: string;
  inbox_email: string;
  inbox_smtp_user: string | null;
  inbox_smtp_pass_encrypted: string | null;
  last_reply_check_at: string | null;
  domain_imap_host: string | null;
  domain_imap_port: number | null;
  domain_imap_pass_encrypted: string | null;
  domain_smtp_user: string | null;
  domain_smtp_pass_encrypted: string | null;
};

export type ReplyCheckResult = {
  inboxesChecked: number;
  repliesDetected: number;
  hardBouncesDetected: number;
  errors: Array<{ inboxId: string; error: string }>;
};

function decodeSecret(secret: string | null): string | null {
  if (!secret) {
    return null;
  }

  if (isEncryptedSecret(secret)) {
    return decryptSecret(secret);
  }

  return secret;
}

function normalizeSubject(subject: string | null | undefined): string {
  return (subject ?? "")
    .toLowerCase()
    .replace(/^(re|fwd|fw):\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMessageIds(headers: { inReplyTo?: string; references?: string | string[] }): string[] {
  const tokens: string[] = [];

  if (headers.inReplyTo) {
    tokens.push(headers.inReplyTo);
  }

  if (Array.isArray(headers.references)) {
    tokens.push(...headers.references);
  } else if (typeof headers.references === "string") {
    tokens.push(headers.references);
  }

  return tokens
    .flatMap((token) => token.split(/\s+/))
    .map((token) => token.trim())
    .filter((token) => token.startsWith("<") && token.endsWith(">"));
}

async function findQueueMatch(input: {
  orgId: string;
  messageIds: string[];
  fromEmail: string;
  subject: string;
}): Promise<{
  id: string;
  campaign_id: string;
  org_id: string;
  lead_id: number | null;
  inbox_id: string;
  step_number: number;
  recipient_email: string;
} | null> {
  if (input.messageIds.length > 0) {
    const messageMatch = await pool.query(
      `SELECT id, campaign_id, org_id, lead_id, inbox_id, step_number, recipient_email
       FROM outreach_send_queue
       WHERE org_id = $1
         AND message_id = ANY($2::text[])
       ORDER BY sent_at DESC NULLS LAST
       LIMIT 1`,
      [input.orgId, input.messageIds]
    );

    if (messageMatch.rows.length > 0) {
      return messageMatch.rows[0];
    }
  }

  const fallbackCandidates = await pool.query(
    `SELECT id, campaign_id, org_id, lead_id, inbox_id, step_number, recipient_email, subject
     FROM outreach_send_queue
     WHERE org_id = $1
       AND recipient_email = $2
       AND status = 'sent'
     ORDER BY sent_at DESC NULLS LAST
     LIMIT 20`,
    [input.orgId, input.fromEmail]
  );

  const normalizedIncoming = normalizeSubject(input.subject);

  const fallback = fallbackCandidates.rows.find(
    (row) => normalizeSubject(String(row.subject ?? "")) === normalizedIncoming
  );

  return fallback ?? null;
}

async function recordReply(input: {
  queueItemId: string;
  orgId: string;
  campaignId: string;
  leadId: number | null;
  inboxId: string;
  stepNumber: number;
  recipientEmail: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT 1
       FROM outreach_email_events
       WHERE queue_item_id = $1
         AND event_type = 'replied'
       LIMIT 1`,
      [input.queueItemId]
    );

    if (existing.rows.length === 0) {
      await client.query(
        `INSERT INTO outreach_email_events
           (org_id, campaign_id, queue_item_id, lead_id, inbox_id, step_number, event_type, metadata)
         VALUES
           ($1, $2, $3, $4, $5, $6, 'replied', $7::jsonb)`,
        [
          input.orgId,
          input.campaignId,
          input.queueItemId,
          input.leadId,
          input.inboxId,
          input.stepNumber,
          JSON.stringify(input.metadata),
        ]
      );

      await client.query(
        `UPDATE outreach_campaigns
         SET total_replied = total_replied + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [input.campaignId]
      );

      await client.query(
        `UPDATE outreach_campaign_steps
         SET replied = replied + 1
         WHERE campaign_id = $1 AND step_number = $2`,
        [input.campaignId, input.stepNumber]
      );
    }

    await client.query(
      `UPDATE outreach_lead_states
       SET status = 'replied',
           last_event_at = NOW()
       WHERE org_id = $1
         AND campaign_id = $2
         AND email = $3`,
      [input.orgId, input.campaignId, input.recipientEmail]
    );

    await client.query(
      `UPDATE outreach_send_queue
       SET status = 'cancelled',
           last_error = 'Stopped due to reply'
       WHERE org_id = $1
         AND campaign_id = $2
         AND recipient_email = $3
         AND status = 'pending'`,
      [input.orgId, input.campaignId, input.recipientEmail]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function processInbox(context: InboxReplyContext): Promise<{
  replies: number;
  hardBounces: number;
}> {
  const imapHost = context.domain_imap_host;
  const imapPort = Number(context.domain_imap_port ?? 993);
  const imapUser =
    context.inbox_smtp_user ?? context.domain_smtp_user ?? context.inbox_email;
  const imapPass =
    decodeSecret(context.domain_imap_pass_encrypted) ??
    decodeSecret(context.inbox_smtp_pass_encrypted) ??
    decodeSecret(context.domain_smtp_pass_encrypted);

  if (!imapHost || !imapUser || !imapPass) {
    throw new Error("IMAP configuration is incomplete");
  }

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: imapPort === 993,
    auth: {
      user: imapUser,
      pass: imapPass,
    },
    logger: false,
  });

  const since = context.last_reply_check_at
    ? new Date(context.last_reply_check_at)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  let repliesDetected = 0;
  let hardBouncesDetected = 0;

  await client.connect();

  try {
    await client.mailboxOpen("INBOX");

    const searchResult = await client.search({ since });
    const recentUids = (searchResult || []).slice(-100);

    for await (const message of client.fetch(recentUids, {
      uid: true,
      source: true,
      envelope: true,
      internalDate: true,
    })) {
      if (!message.source) {
        continue;
      }

      const parsed = await simpleParser(message.source);
      const fromAddress = parsed.from?.value?.[0]?.address?.toLowerCase() ?? "";
      const subject = parsed.subject ?? "";
      const bodyText = parsed.text ?? "";

      if (!fromAddress || fromAddress === context.inbox_email.toLowerCase()) {
        continue;
      }

      const bounce = parseBounceMessage({
        subject,
        from: fromAddress,
        body: bodyText,
      });

      const messageIds = extractMessageIds({
        inReplyTo:
          typeof parsed.inReplyTo === "string" ? parsed.inReplyTo : undefined,
        references: Array.isArray(parsed.references)
          ? parsed.references.map(String)
          : typeof parsed.references === "string"
            ? parsed.references
            : undefined,
      });

      const queueMatch = await findQueueMatch({
        orgId: context.org_id,
        messageIds,
        fromEmail: fromAddress,
        subject,
      });

      if (!queueMatch) {
        continue;
      }

      if (bounce.isBounce && bounce.isHardBounce) {
        const bounceEmail = bounce.recipientEmail ?? queueMatch.recipient_email;

        await handleHardBounce({
          orgId: queueMatch.org_id,
          campaignId: queueMatch.campaign_id,
          inboxId: queueMatch.inbox_id,
          queueItemId: queueMatch.id,
          leadId: queueMatch.lead_id,
          stepNumber: queueMatch.step_number,
          recipientEmail: bounceEmail,
          reason: bounce.reason,
        });

        hardBouncesDetected += 1;
        continue;
      }

      await recordReply({
        queueItemId: queueMatch.id,
        orgId: queueMatch.org_id,
        campaignId: queueMatch.campaign_id,
        leadId: queueMatch.lead_id,
        inboxId: queueMatch.inbox_id,
        stepNumber: queueMatch.step_number,
        recipientEmail: queueMatch.recipient_email,
        metadata: {
          from: fromAddress,
          subject,
          in_reply_to: parsed.inReplyTo ?? null,
          references: parsed.references ?? null,
          received_at:
            message.internalDate instanceof Date
              ? message.internalDate.toISOString()
              : typeof message.internalDate === "string"
                ? message.internalDate
                : new Date().toISOString(),
        },
      });

      repliesDetected += 1;
    }

    await pool.query(
      `UPDATE outreach_inboxes
       SET last_reply_check_at = NOW()
       WHERE id = $1`,
      [context.inbox_id]
    );
  } finally {
    await client.logout();
  }

  return {
    replies: repliesDetected,
    hardBounces: hardBouncesDetected,
  };
}

export async function checkRepliesForActiveInboxes(): Promise<ReplyCheckResult> {
  const inboxResult = await pool.query(
    `SELECT
       i.org_id,
       i.id AS inbox_id,
       i.email AS inbox_email,
       i.smtp_user AS inbox_smtp_user,
       i.smtp_pass_encrypted AS inbox_smtp_pass_encrypted,
       i.last_reply_check_at,
       d.imap_host AS domain_imap_host,
       d.imap_port AS domain_imap_port,
       d.imap_pass_encrypted AS domain_imap_pass_encrypted,
       d.smtp_user AS domain_smtp_user,
       d.smtp_pass_encrypted AS domain_smtp_pass_encrypted
     FROM outreach_inboxes i
     JOIN outreach_domains d ON d.id = i.domain_id
     WHERE i.is_active = true
       AND d.can_send = true
       AND d.imap_host IS NOT NULL`
  );

  const result: ReplyCheckResult = {
    inboxesChecked: 0,
    repliesDetected: 0,
    hardBouncesDetected: 0,
    errors: [],
  };

  for (const row of inboxResult.rows as InboxReplyContext[]) {
    result.inboxesChecked += 1;

    try {
      const inboxResultMetrics = await processInbox(row);
      result.repliesDetected += inboxResultMetrics.replies;
      result.hardBouncesDetected += inboxResultMetrics.hardBounces;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown reply detection error";

      result.errors.push({
        inboxId: row.inbox_id,
        error: message,
      });

      await logOperation({
        orgId: row.org_id,
        inboxId: row.inbox_id,
        logType: "reply_detector_error",
        level: "error",
        message: "Reply detector failed for inbox",
        metadata: {
          error: message,
        },
      });
    }
  }

  return result;
}
