import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/multi-tenant";
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { decryptSecret, isEncryptedSecret } from "@/lib/crypto";
import { testConnection } from "@/lib/email/smtp-client";

const schema = z.object({
  inbox_id: z.string().uuid(),
});

function decodeSecret(secret: string | null): string | null {
  if (!secret) {
    return null;
  }

  return isEncryptedSecret(secret) ? decryptSecret(secret) : secret;
}

export async function POST(request: NextRequest) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) {
    return auth.response;
  }

  const apiRate = checkRateLimit(`api:${auth.context.userId}`, RATE_LIMITS.apiUser);
  if (!apiRate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(apiRate) }
    );
  }

  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Valid inbox_id is required" },
        { status: 400, headers: rateLimitHeaders(apiRate) }
      );
    }

    const result = await pool.query(
      `SELECT i.id,
              i.email,
              i.display_name,
              i.smtp_user,
              i.smtp_pass_encrypted,
              d.smtp_host,
              d.smtp_port,
              d.smtp_user AS domain_smtp_user,
              d.smtp_pass_encrypted AS domain_smtp_pass_encrypted
       FROM outreach_inboxes i
       JOIN outreach_domains d ON d.id = i.domain_id
       WHERE i.id = $1 AND i.org_id = $2`,
      [parsed.data.inbox_id, auth.context.orgId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Inbox not found" },
        { status: 404, headers: rateLimitHeaders(apiRate) }
      );
    }

    const row = result.rows[0] as {
      id: string;
      email: string;
      display_name: string;
      smtp_user: string | null;
      smtp_pass_encrypted: string | null;
      smtp_host: string | null;
      smtp_port: number | null;
      domain_smtp_user: string | null;
      domain_smtp_pass_encrypted: string | null;
    };

    const smtpHost = row.smtp_host;
    const smtpPort = Number(row.smtp_port ?? 587);
    const smtpUser = row.smtp_user ?? row.domain_smtp_user;
    const smtpPass =
      decodeSecret(row.smtp_pass_encrypted) ??
      decodeSecret(row.domain_smtp_pass_encrypted);

    if (!smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json(
        { error: "SMTP configuration incomplete for this inbox" },
        { status: 400, headers: rateLimitHeaders(apiRate) }
      );
    }

    const testResult = await testConnection({
      inboxId: row.id,
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      pass: smtpPass,
      fromEmail: row.email,
      fromName: row.display_name || undefined,
    });

    if (!testResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: testResult.error,
          code: testResult.code,
        },
        { status: 400, headers: rateLimitHeaders(apiRate) }
      );
    }

    return NextResponse.json(
      { ok: true },
      { headers: rateLimitHeaders(apiRate) }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "SMTP connection test failed",
      },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}
