import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { checkRepliesForActiveInboxes } from "@/lib/email/reply-detector";

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

  const startedAt = Date.now();
  const result = await checkRepliesForActiveInboxes();

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
    result,
  });
}

export async function GET(request: NextRequest) {
  try {
    return await handleCron(request);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Reply check failed",
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
        error: error instanceof Error ? error.message : "Reply check failed",
      },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
