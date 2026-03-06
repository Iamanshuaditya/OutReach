import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireOrgRole } from "@/lib/auth/multi-tenant";
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import {
  accessCodeCreateSchema,
  accessCodeDeleteSchema,
  accessCodePatchSchema,
  formatZodError,
} from "@/lib/validation";

async function requireCodeAdmin(request: NextRequest) {
  return requireOrgRole(request, ["owner", "admin"]);
}

// GET — list all invite codes in current org
export async function GET(request: NextRequest) {
  const auth = await requireCodeAdmin(request);
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

  const result = await pool.query(
    `SELECT id, code, name, role, created_at, last_used_at, is_active
     FROM access_codes
     WHERE org_id = $1
     ORDER BY created_at DESC`,
    [auth.context.orgId]
  );

  return NextResponse.json(
    { codes: result.rows },
    { headers: rateLimitHeaders(apiRate) }
  );
}

// POST — create a new invite code in current org
export async function POST(request: NextRequest) {
  const auth = await requireCodeAdmin(request);
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
    const parsed = accessCodeCreateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400, headers: rateLimitHeaders(apiRate) }
      );
    }

    const { name, role } = parsed.data;
    const code = randomBytes(6).toString("hex");

    const result = await pool.query(
      `INSERT INTO access_codes (code, name, role, org_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, code, name, role, created_at, is_active`,
      [code, name, role ?? "member", auth.context.orgId]
    );

    return NextResponse.json(
      { code: result.rows[0] },
      { status: 201, headers: rateLimitHeaders(apiRate) }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: rateLimitHeaders(apiRate) }
    );
  }
}

// PATCH — toggle active status of a code
export async function PATCH(request: NextRequest) {
  const auth = await requireCodeAdmin(request);
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
    const parsed = accessCodePatchSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400, headers: rateLimitHeaders(apiRate) }
      );
    }

    const { id, is_active } = parsed.data;

    const result = await pool.query(
      `UPDATE access_codes
       SET is_active = $1
       WHERE id = $2 AND org_id = $3
       RETURNING id, code, name, role, is_active`,
      [is_active, id, auth.context.orgId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Code not found" },
        { status: 404, headers: rateLimitHeaders(apiRate) }
      );
    }

    return NextResponse.json(
      { code: result.rows[0] },
      { headers: rateLimitHeaders(apiRate) }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: rateLimitHeaders(apiRate) }
    );
  }
}

// DELETE — delete a code permanently
export async function DELETE(request: NextRequest) {
  const auth = await requireCodeAdmin(request);
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
    const parsed = accessCodeDeleteSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400, headers: rateLimitHeaders(apiRate) }
      );
    }

    const { id } = parsed.data;

    await pool.query(
      `UPDATE access_logs
       SET code_id = NULL
       WHERE code_id = $1 AND org_id = $2`,
      [id, auth.context.orgId]
    );

    const result = await pool.query(
      `DELETE FROM access_codes
       WHERE id = $1 AND org_id = $2
       RETURNING id`,
      [id, auth.context.orgId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Code not found" },
        { status: 404, headers: rateLimitHeaders(apiRate) }
      );
    }

    return NextResponse.json(
      { success: true },
      { headers: rateLimitHeaders(apiRate) }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: rateLimitHeaders(apiRate) }
    );
  }
}
