import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { processQueueBatch } from "@/lib/email/queue-worker";
import { requireOrgContext } from "@/lib/auth/multi-tenant";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOrgContext(request);

    const batchSizeRaw = request.nextUrl.searchParams.get("batch");
    const batchSize = Math.min(
      100,
      Math.max(1, Number.parseInt(batchSizeRaw ?? "100", 10) || 100)
    );

    const force = request.nextUrl.searchParams.get("force") === "1";
    const campaignId = request.nextUrl.searchParams.get("campaign");

    // Force mode: move scheduled_at to now so items become due immediately
    if (force) {
      const orgId =
        auth && typeof auth === "object" && "context" in auth
          ? (auth as { context: { orgId: string } }).context.orgId
          : null;

      if (campaignId && orgId) {
        await pool.query(
          `UPDATE outreach_send_queue
           SET scheduled_at = NOW(), next_attempt_at = NULL
           WHERE campaign_id = $1 AND org_id = $2 AND status = 'pending'`,
          [campaignId, orgId]
        );
      } else {
        await pool.query(
          `UPDATE outreach_send_queue
           SET scheduled_at = NOW(), next_attempt_at = NULL
           WHERE status = 'pending'`
        );
      }
    }

    const startedAt = Date.now();
    const result = await processQueueBatch(batchSize);

    return NextResponse.json({
      ok: true,
      batchSize,
      durationMs: Date.now() - startedAt,
      result,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Queue processing failed";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
