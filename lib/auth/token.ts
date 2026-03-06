import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "@/lib/env";

export type OrgRole = "owner" | "admin" | "member" | "viewer";

export type AuthTokenClaims = {
  userId: string;
  orgId: string;
  role: OrgRole;
  name: string;
  isSuperAdmin?: boolean;
};

export type DecodedAuthToken = AuthTokenClaims;

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(env.AUTH_SECRET);
}

function mapPayload(payload: JWTPayload): DecodedAuthToken | null {
  if (
    typeof payload.user_id !== "string" ||
    typeof payload.org_id !== "string" ||
    typeof payload.role !== "string" ||
    typeof payload.name !== "string"
  ) {
    return null;
  }

  const role = payload.role as OrgRole;
  if (!(["owner", "admin", "member", "viewer"] as const).includes(role)) {
    return null;
  }

  return {
    userId: payload.user_id,
    orgId: payload.org_id,
    role,
    name: payload.name,
    isSuperAdmin: payload.is_super_admin === true,
  };
}

export async function createAuthToken(claims: AuthTokenClaims): Promise<string> {
  return new SignJWT({
    user_id: claims.userId,
    org_id: claims.orgId,
    role: claims.role,
    name: claims.name,
    is_super_admin: claims.isSuperAdmin ?? false,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export async function decodeAuthToken(
  token: string
): Promise<DecodedAuthToken | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return mapPayload(payload);
  } catch {
    return null;
  }
}

export async function verifyAuthToken(token: string): Promise<boolean> {
  const claims = await decodeAuthToken(token);
  return claims !== null;
}
