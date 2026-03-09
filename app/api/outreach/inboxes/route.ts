import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { requireOrgContext } from "@/lib/auth/multi-tenant";
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import {
  formatZodError,
  inboxCreateSchema,
  inboxUpdateSchema,
} from "@/lib/validation";

function sanitizeInbox(row: Record<string, unknown>) {
  const { smtp_pass, smtp_pass_encrypted, ...safeRow } = row;

  void smtp_pass;
  void smtp_pass_encrypted;

  return {
    ...safeRow,
    health:
      typeof row.health_score === "number"
        ? row.health_score >= 90
          ? "excellent"
          : row.health_score >= 70
            ? "good"
            : row.health_score >= 50
              ? "fair"
              : "poor"
        : "fair",
    bounce_rate: Number(row.bounce_rate ?? 0),
    reply_rate: Number(row.reply_rate ?? 0),
    open_rate: Number(row.open_rate ?? 0),
  };
}

// GET — list inboxes (optionally by domain), scoped to org
export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get("domain_id");

    let query = `SELECT i.*, d.domain as domain_name
                 FROM outreach_inboxes i
                 JOIN outreach_domains d ON d.id = i.domain_id
                 WHERE i.org_id = $1 AND d.org_id = $1`;

    const params: Array<string> = [auth.context.orgId];

    if (domainId) {
      query += ` AND i.domain_id = $2`;
      params.push(domainId);
    }

    query += ` ORDER BY i.created_at ASC`;

    const result = await pool.query(query, params);

    return NextResponse.json(
      { inboxes: result.rows.map(sanitizeInbox) },
      { headers: rateLimitHeaders(apiRate) }
    );
  } catch (error) {
    console.error("Error fetching inboxes:", error);
    return NextResponse.json(
      { error: "Failed to fetch inboxes" },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}

// POST — add inbox to a domain
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
    const rawBody = await request.json();
    const parsed = inboxCreateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400, headers: rateLimitHeaders(apiRate) }
      );
    }

    const { domain_id, email, display_name, smtp_user, smtp_pass, daily_limit } =
      parsed.data;

    const domainCheck = await pool.query(
      `SELECT id FROM outreach_domains WHERE id = $1 AND org_id = $2`,
      [domain_id, auth.context.orgId]
    );

    if (domainCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Domain not found" },
        { status: 404, headers: rateLimitHeaders(apiRate) }
      );
    }

    const existing = await pool.query(
      `SELECT id
       FROM outreach_inboxes
       WHERE org_id = $1 AND email = $2`,
      [auth.context.orgId, email]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "Inbox already exists" },
        { status: 409, headers: rateLimitHeaders(apiRate) }
      );
    }

    const result = await pool.query(
      `INSERT INTO outreach_inboxes
         (org_id, domain_id, email, display_name, smtp_user, smtp_pass_encrypted,
          daily_limit, health_score, warmup_level, warmup_day)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, 50, 'new', 0)
       RETURNING *`,
      [
        auth.context.orgId,
        domain_id,
        email,
        display_name ?? "",
        smtp_user ?? null,
        smtp_pass ? encryptSecret(smtp_pass) : null,
        daily_limit ?? 20,
      ]
    );

    return NextResponse.json(
      { inbox: sanitizeInbox(result.rows[0]) },
      { status: 201, headers: rateLimitHeaders(apiRate) }
    );
  } catch (error) {
    console.error("Error creating inbox:", error);
    return NextResponse.json(
      { error: "Failed to create inbox" },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}

// PUT — update inbox (toggle active, change limit, etc.)
export async function PUT(request: NextRequest) {
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
    const rawBody = await request.json();
    const parsed = inboxUpdateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400, headers: rateLimitHeaders(apiRate) }
      );
    }

    const { id, is_active, daily_limit, warmup_level, display_name } = parsed.data;

    const updates: string[] = [];
    const values: Array<string | number | boolean> = [];
    let paramIndex = 1;

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }

    if (daily_limit !== undefined) {
      updates.push(`daily_limit = $${paramIndex++}`);
      values.push(daily_limit);
    }

    if (warmup_level !== undefined) {
      updates.push(`warmup_level = $${paramIndex++}`);
      values.push(warmup_level);
    }

    if (display_name !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(display_name);
    }

    values.push(id, auth.context.orgId);

    const result = await pool.query(
      `UPDATE outreach_inboxes
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex++} AND org_id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Inbox not found" },
        { status: 404, headers: rateLimitHeaders(apiRate) }
      );
    }

    return NextResponse.json(
      { inbox: sanitizeInbox(result.rows[0]) },
      { headers: rateLimitHeaders(apiRate) }
    );
  } catch (error) {
    console.error("Error updating inbox:", error);
    return NextResponse.json(
      { error: "Failed to update inbox" },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}

// DELETE — remove inbox
export async function DELETE(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Inbox ID required" },
        { status: 400, headers: rateLimitHeaders(apiRate) }
      );
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `DELETE FROM outreach_email_events WHERE inbox_id = $1`,
        [id]
      );
      await client.query(
        `DELETE FROM outreach_operation_logs WHERE inbox_id = $1`,
        [id]
      );
      await client.query(
        `UPDATE outreach_send_queue SET status = 'cancelled', last_error = 'Inbox deleted'
         WHERE inbox_id = $1 AND status IN ('pending', 'sending')`,
        [id]
      );
      await client.query(
        `DELETE FROM outreach_send_queue WHERE inbox_id = $1`,
        [id]
      );
      await client.query(
        `DELETE FROM outreach_inboxes WHERE id = $1 AND org_id = $2`,
        [id, auth.context.orgId]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json(
      { success: true },
      { headers: rateLimitHeaders(apiRate) }
    );
  } catch (error) {
    console.error("Error deleting inbox:", error);
    return NextResponse.json(
      { error: "Failed to delete inbox" },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}
