import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { randomBytes } from "crypto";
import pool from "@/lib/db";

async function requireAdmin(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return false;

  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload.role === "admin";
  } catch {
    return false;
  }
}

// GET — list all invite codes
export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const result = await pool.query(
    `SELECT id, code, name, created_at, last_used_at, is_active FROM access_codes ORDER BY created_at DESC`
  );

  return NextResponse.json({ codes: result.rows });
}

// POST — create a new invite code
export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const { name } = await request.json();

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const code = randomBytes(6).toString("hex"); // 12-char hex code

    const result = await pool.query(
      `INSERT INTO access_codes (code, name) VALUES ($1, $2) RETURNING id, code, name, created_at, is_active`,
      [code, name.trim()]
    );

    return NextResponse.json({ code: result.rows[0] }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// PATCH — toggle active status of a code
export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const { id, is_active } = await request.json();

    if (!id || typeof is_active !== "boolean") {
      return NextResponse.json(
        { error: "id and is_active are required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `UPDATE access_codes SET is_active = $1 WHERE id = $2 RETURNING id, code, name, is_active`,
      [is_active, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Code not found" }, { status: 404 });
    }

    return NextResponse.json({ code: result.rows[0] });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE — delete a code permanently
export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Nullify references in access_logs first
    await pool.query(
      `UPDATE access_logs SET code_id = NULL WHERE code_id = $1`,
      [id]
    );

    const result = await pool.query(
      `DELETE FROM access_codes WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Code not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
