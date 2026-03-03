import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { timingSafeEqual } from "crypto";
import pool from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    const adminPassword = process.env.AUTH_PASSWORD;
    if (!adminPassword) {
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 }
      );
    }

    // Check if it's the admin password (constant-time)
    const a = Buffer.from(password.padEnd(256, "\0"));
    const b = Buffer.from(adminPassword.padEnd(256, "\0"));
    const isAdmin = a.length === b.length && timingSafeEqual(a, b);

    let identity: { name: string; role: string; codeId?: number };

    if (isAdmin) {
      identity = { name: "Admin", role: "admin" };
    } else {
      // Check against invite codes in database
      const result = await pool.query(
        `SELECT id, name FROM access_codes WHERE code = $1 AND is_active = true`,
        [password]
      );

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: "Invalid password" },
          { status: 401 }
        );
      }

      const code = result.rows[0];
      identity = { name: code.name, role: "user", codeId: code.id };

      // Update last_used_at
      await pool.query(
        `UPDATE access_codes SET last_used_at = NOW() WHERE id = $1`,
        [code.id]
      );
    }

    // Log the access
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    await pool.query(
      `INSERT INTO access_logs (code_id, name, ip_address, user_agent) VALUES ($1, $2, $3, $4)`,
      [identity.codeId || null, identity.name, ip, userAgent]
    );

    // Sign JWT with identity
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const token = await new SignJWT({
      name: identity.name,
      role: identity.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    const response = NextResponse.json({
      success: true,
      name: identity.name,
      role: identity.role,
    });
    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
