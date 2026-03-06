import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processQueueBatch } from "@/lib/email/queue-worker";

function isAuthorized(request: NextRequest): boolean {
  if (!env.CRON_SECRET) {
    return true;
  }

  const token =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  return token === env.CRON_SECRET;
}

async function handleCron(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const batchSizeRaw = request.nextUrl.searchParams.get("batch");
  const batchSize = Math.min(
    100,
    Math.max(1, Number.parseInt(batchSizeRaw ?? "25", 10) || 25)
  );

  const startedAt = Date.now();
  const result = await processQueueBatch(batchSize);

  return NextResponse.json({
    ok: true,
    batchSize,
    durationMs: Date.now() - startedAt,
    result,
    processedAt: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  try {
    return await handleCron(request);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Queue processing failed",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handleCron(request);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Queue processing failed",
      },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
