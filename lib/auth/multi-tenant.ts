import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import {
  decodeAuthToken,
  type DecodedAuthToken as OrgAuthContext,
  type OrgRole,
} from "@/lib/auth/token";

type RequireOrgContextResult =
  | { ok: true; context: OrgAuthContext }
  | { ok: false; response: NextResponse };

async function resolveMembership(
  userId: string,
  orgId: string
): Promise<{ name: string; role: OrgRole; isSuperAdmin: boolean } | null> {
  const result = await pool.query(
    `SELECT u.name, u.is_super_admin, uo.role
     FROM users u
     JOIN user_organizations uo ON u.id = uo.user_id
     WHERE u.id = $1 AND uo.org_id = $2 AND u.is_active = true`,
    [userId, orgId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as {
    name: string;
    is_super_admin: boolean;
    role: OrgRole;
  };

  return {
    name: row.name,
    role: row.role,
    isSuperAdmin: row.is_super_admin,
  };
}

export async function requireOrgContext(
  request: NextRequest
): Promise<RequireOrgContextResult> {
  const token = request.cookies.get("auth_token")?.value;

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const claims = await decodeAuthToken(token);
  if (!claims) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const membership = await resolveMembership(claims.userId, claims.orgId);
  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Organization access revoked" },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    context: {
      userId: claims.userId,
      orgId: claims.orgId,
      role: membership.role,
      name: membership.name,
      isSuperAdmin: membership.isSuperAdmin,
    },
  };
}

export async function requireOrgRole(
  request: NextRequest,
  allowedRoles: OrgRole[]
): Promise<RequireOrgContextResult> {
  const auth = await requireOrgContext(request);
  if (!auth.ok) {
    return auth;
  }

  if (
    !auth.context.isSuperAdmin &&
    !allowedRoles.includes(auth.context.role)
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      ),
    };
  }

  return auth;
}
