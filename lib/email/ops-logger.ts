import pool from "@/lib/db";

export type OperationLogLevel = "info" | "warn" | "error";

export type OperationLogInput = {
  orgId?: string | null;
  campaignId?: string | null;
  inboxId?: string | null;
  queueItemId?: string | null;
  logType: string;
  level?: OperationLogLevel;
  message: string;
  metadata?: Record<string, unknown>;
};

export async function logOperation(input: OperationLogInput): Promise<void> {
  const {
    orgId = null,
    campaignId = null,
    inboxId = null,
    queueItemId = null,
    logType,
    level = "info",
    message,
    metadata = {},
  } = input;

  try {
    await pool.query(
      `INSERT INTO outreach_operation_logs
         (org_id, campaign_id, inbox_id, queue_item_id, log_type, level, message, metadata)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        orgId,
        campaignId,
        inboxId,
        queueItemId,
        logType,
        level,
        message,
        JSON.stringify(metadata),
      ]
    );
  } catch (error) {
    const context = {
      orgId,
      campaignId,
      inboxId,
      queueItemId,
      logType,
      level,
      message,
      metadata,
      error,
    };

    if (level === "error") {
      console.error("Operation log write failed", context);
    } else {
      console.warn("Operation log write failed", context);
    }
  }
}
