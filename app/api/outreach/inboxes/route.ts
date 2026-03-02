import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

// GET — list inboxes (optionally by domain)
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const domainId = searchParams.get('domain_id');

        let query = `SELECT i.*, d.domain as domain_name FROM outreach_inboxes i
                  JOIN outreach_domains d ON d.id = i.domain_id`;
        const params: string[] = [];

        if (domainId) {
            query += ` WHERE i.domain_id = $1`;
            params.push(domainId);
        }
        query += ` ORDER BY i.created_at ASC`;

        const result = await pool.query(query, params);

        return NextResponse.json({
            inboxes: result.rows.map(i => ({
                ...i,
                health: i.health_score >= 90 ? 'excellent' : i.health_score >= 70 ? 'good' : i.health_score >= 50 ? 'fair' : 'poor',
                bounce_rate: parseFloat(i.bounce_rate),
                reply_rate: parseFloat(i.reply_rate),
                open_rate: parseFloat(i.open_rate),
            })),
        });
    } catch (error) {
        console.error("Error fetching inboxes:", error);
        return NextResponse.json({ error: "Failed to fetch inboxes" }, { status: 500 });
    }
}

// POST — add inbox to a domain
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { domain_id, email, display_name, smtp_user, smtp_pass, daily_limit } = body;

        if (!domain_id || !email) {
            return NextResponse.json({ error: "domain_id and email are required" }, { status: 400 });
        }

        // Check domain exists
        const domainCheck = await pool.query(`SELECT id, provider FROM outreach_domains WHERE id = $1`, [domain_id]);
        if (domainCheck.rows.length === 0) {
            return NextResponse.json({ error: "Domain not found" }, { status: 404 });
        }

        // Check if inbox already exists
        const existing = await pool.query(
            `SELECT id FROM outreach_inboxes WHERE email = $1`,
            [email]
        );
        if (existing.rows.length > 0) {
            return NextResponse.json({ error: "Inbox already exists" }, { status: 409 });
        }

        const defaultLimit = daily_limit || 20; // Start conservative for new inbox

        const result = await pool.query(
            `INSERT INTO outreach_inboxes (domain_id, email, display_name, smtp_user, smtp_pass, daily_limit, health_score, warmup_level, warmup_day)
       VALUES ($1, $2, $3, $4, $5, $6, 50, 'new', 0)
       RETURNING *`,
            [domain_id, email, display_name || '', smtp_user || null, smtp_pass || null, defaultLimit]
        );

        return NextResponse.json({ inbox: result.rows[0] }, { status: 201 });
    } catch (error) {
        console.error("Error creating inbox:", error);
        return NextResponse.json({ error: "Failed to create inbox" }, { status: 500 });
    }
}

// PUT — update inbox (toggle active, change limit, etc.)
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, is_active, daily_limit, warmup_level, display_name } = body;

        if (!id) return NextResponse.json({ error: "Inbox ID required" }, { status: 400 });

        const updates: string[] = [];
        const values: (string | number | boolean)[] = [];
        let paramIndex = 1;

        if (is_active !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(is_active); }
        if (daily_limit !== undefined) { updates.push(`daily_limit = $${paramIndex++}`); values.push(daily_limit); }
        if (warmup_level !== undefined) { updates.push(`warmup_level = $${paramIndex++}`); values.push(warmup_level); }
        if (display_name !== undefined) { updates.push(`display_name = $${paramIndex++}`); values.push(display_name); }

        if (updates.length === 0) {
            return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
        }

        values.push(id);
        const result = await pool.query(
            `UPDATE outreach_inboxes SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return NextResponse.json({ error: "Inbox not found" }, { status: 404 });
        }

        return NextResponse.json({ inbox: result.rows[0] });
    } catch (error) {
        console.error("Error updating inbox:", error);
        return NextResponse.json({ error: "Failed to update inbox" }, { status: 500 });
    }
}

// DELETE — remove inbox
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: "Inbox ID required" }, { status: 400 });

        await pool.query(`DELETE FROM outreach_inboxes WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting inbox:", error);
        return NextResponse.json({ error: "Failed to delete inbox" }, { status: 500 });
    }
}
