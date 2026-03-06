import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { env } from "@/lib/env";
import { createAuthToken, type OrgRole } from "@/lib/auth/token";
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { formatZodError, loginSchema } from "@/lib/validation";

type LoginIdentity = {
  name: string;
  role: OrgRole;
  codeId: number | null;
  orgId: string | null;
  userEmail: string;
  isSuperAdmin: boolean;
};

function constantTimeMatch(input: string, expected: string): boolean {
  const a = Buffer.from(input.padEnd(256, "\0"));
  const b = Buffer.from(expected.padEnd(256, "\0"));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function ensureDefaultOrganizationId(client: PoolClient): Promise<string> {
  const result = await client.query(
    `INSERT INTO organizations (name, slug)
     VALUES ('Default Organization', 'default-org')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`
  );

  return result.rows[0].id as string;
}

async function ensureUserMembership(
  client: PoolClient,
  identity: LoginIdentity,
  fallbackOrgId: string
): Promise<{ userId: string; orgId: string; role: OrgRole }> {
  const orgId = identity.orgId ?? fallbackOrgId;

  const userResult = await client.query(
    `INSERT INTO users (email, name, is_super_admin)
     VALUES ($1, $2, $3)
     ON CONFLICT (email)
     DO UPDATE SET name = EXCLUDED.name,
                   is_super_admin = users.is_super_admin OR EXCLUDED.is_super_admin,
                   updated_at = NOW()
     RETURNING id`,
    [identity.userEmail, identity.name, identity.isSuperAdmin]
  );

  const userId = userResult.rows[0].id as string;

  await client.query(
    `INSERT INTO user_organizations (user_id, org_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, org_id)
     DO UPDATE SET role = EXCLUDED.role`,
    [userId, orgId, identity.role]
  );

  if (identity.codeId) {
    await client.query(
      `UPDATE access_codes
       SET org_id = COALESCE(org_id, $1)
       WHERE id = $2`,
      [orgId, identity.codeId]
    );
  }

  return { userId, orgId, role: identity.role };
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const authRate = checkRateLimit(`auth:${ip}`, RATE_LIMITS.auth);

  if (!authRate.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again shortly." },
      { status: 429, headers: rateLimitHeaders(authRate) }
    );
  }

  try {
    const rawBody = await request.json();
    const parsed = loginSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400, headers: rateLimitHeaders(authRate) }
      );
    }

    const { password } = parsed.data;

    let identity: LoginIdentity;

    if (constantTimeMatch(password, env.AUTH_PASSWORD)) {
      identity = {
        name: "Admin",
        role: "owner",
        codeId: null,
        orgId: null,
        userEmail: env.AUTH_ADMIN_EMAIL,
        isSuperAdmin: true,
      };
    } else {
      const codeResult = await pool.query(
        `SELECT id, name, org_id, role
         FROM access_codes
         WHERE code = $1 AND is_active = true`,
        [password]
      );

      if (codeResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Invalid password" },
          { status: 401, headers: rateLimitHeaders(authRate) }
        );
      }

      const code = codeResult.rows[0] as {
        id: number;
        name: string;
        org_id: string | null;
        role: OrgRole | null;
      };

      identity = {
        name: code.name,
        role: code.role ?? "member",
        codeId: code.id,
        orgId: code.org_id,
        userEmail: `code-${code.id}@leadbase.local`,
        isSuperAdmin: false,
      };
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const defaultOrgId = await ensureDefaultOrganizationId(client);
      const membership = await ensureUserMembership(client, identity, defaultOrgId);

      if (identity.codeId) {
        await client.query(
          `UPDATE access_codes SET last_used_at = NOW() WHERE id = $1`,
          [identity.codeId]
        );
      }

      const userAgent = request.headers.get("user-agent") ?? "unknown";

      await client.query(
        `INSERT INTO access_logs (code_id, user_id, org_id, name, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          identity.codeId,
          membership.userId,
          membership.orgId,
          identity.name,
          ip,
          userAgent,
        ]
      );

      await client.query("COMMIT");

      const token = await createAuthToken({
        userId: membership.userId,
        orgId: membership.orgId,
        role: membership.role,
        name: identity.name,
        isSuperAdmin: identity.isSuperAdmin,
      });

      const response = NextResponse.json(
        {
          success: true,
          name: identity.name,
          role: membership.role,
          org_id: membership.orgId,
        },
        { headers: rateLimitHeaders(authRate) }
      );

      response.cookies.set("auth_token", token, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });

      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Authentication transaction failed", error);
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 500, headers: rateLimitHeaders(authRate) }
      );
    } finally {
      client.release();
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: rateLimitHeaders(authRate) }
    );
  }
}

// Force Next.js to run this route in Node.js runtime due crypto + DB usage.
export const runtime = "nodejs";

// Avoid static optimization for auth route.
export const dynamic = "force-dynamic";
