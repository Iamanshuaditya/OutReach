import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

// GET — list all campaigns with steps
export async function GET() {
    try {
        const campaignsResult = await pool.query(
            `SELECT * FROM outreach_campaigns ORDER BY created_at DESC`
        );

        const campaigns = [];
        for (const c of campaignsResult.rows) {
            const stepsResult = await pool.query(
                `SELECT * FROM outreach_campaign_steps WHERE campaign_id = $1 ORDER BY step_number ASC`,
                [c.id]
            );
            const inboxesResult = await pool.query(
                `SELECT ci.inbox_id, i.email FROM outreach_campaign_inboxes ci
         JOIN outreach_inboxes i ON i.id = ci.inbox_id
         WHERE ci.campaign_id = $1`,
                [c.id]
            );

            campaigns.push({
                ...c,
                steps: stepsResult.rows,
                inbox_ids: inboxesResult.rows.map((r: { inbox_id: string }) => r.inbox_id),
                inbox_emails: inboxesResult.rows.map((r: { email: string }) => r.email),
                sending_window: {
                    start_hour: c.window_start_hour,
                    end_hour: c.window_end_hour,
                    timezone: c.window_timezone,
                    days: c.window_days,
                },
                stats: {
                    total_leads: c.lead_count,
                    total_sent: c.total_sent,
                    total_delivered: c.total_delivered,
                    total_opened: c.total_opened,
                    total_replied: c.total_replied,
                    total_bounced: c.total_bounced,
                    total_unsubscribed: c.total_unsubscribed,
                    positive_replies: c.positive_replies,
                    credits_used: c.credits_used,
                    credits_refunded: c.credits_refunded,
                    current_step: 1,
                },
                health_check: c.health_check_data,
            });
        }

        return NextResponse.json({ campaigns });
    } catch (error) {
        console.error("Error fetching campaigns:", error);
        return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
    }
}

// POST — create a new campaign
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            name, lead_source, lead_count, send_mode,
            sender_name, sender_company, product_description, value_proposition,
            window_start_hour, window_end_hour, window_timezone, window_days,
            max_per_hour_per_inbox, min_interval_seconds, max_interval_seconds,
            steps, inbox_ids, health_check_data, status,
        } = body;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Insert campaign
            const campaignResult = await client.query(
                `INSERT INTO outreach_campaigns
          (name, status, lead_source, lead_count, send_mode,
           sender_name, sender_company, product_description, value_proposition,
           window_start_hour, window_end_hour, window_timezone, window_days,
           max_per_hour_per_inbox, min_interval_seconds, max_interval_seconds,
           health_check_passed, health_check_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
                [
                    name || 'Untitled Campaign', status || 'draft', lead_source || null, lead_count || 0, send_mode || 'safe',
                    sender_name || '', sender_company || '', product_description || '', value_proposition || '',
                    window_start_hour ?? 9, window_end_hour ?? 17, window_timezone || 'America/New_York', window_days || ['mon', 'tue', 'wed', 'thu', 'fri'],
                    max_per_hour_per_inbox ?? 8, min_interval_seconds ?? 180, max_interval_seconds ?? 420,
                    health_check_data ? true : null, health_check_data ? JSON.stringify(health_check_data) : null,
                ]
            );

            const campaignId = campaignResult.rows[0].id;

            // Insert steps
            if (steps && steps.length > 0) {
                for (const step of steps) {
                    await client.query(
                        `INSERT INTO outreach_campaign_steps
              (campaign_id, step_number, type, subject_template, body_template, ai_personalize, tone, wait_days, condition)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                        [campaignId, step.step_number, step.type, step.subject_template || '', step.body_template || '',
                            step.ai_personalize ?? true, step.tone || 'direct', step.wait_days || 0, step.condition || null]
                    );
                }
            }

            // Link inboxes
            if (inbox_ids && inbox_ids.length > 0) {
                for (const inboxId of inbox_ids) {
                    await client.query(
                        `INSERT INTO outreach_campaign_inboxes (campaign_id, inbox_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
                        [campaignId, inboxId]
                    );
                }
            }

            await client.query('COMMIT');

            return NextResponse.json({ campaign: campaignResult.rows[0] }, { status: 201 });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Error creating campaign:", error);
        return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
    }
}

// PUT — update campaign (status, stats, etc.)
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, status, name } = body;

        if (!id) return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });

        const updates: string[] = [];
        const values: (string | number)[] = [];
        let paramIndex = 1;

        if (status) { updates.push(`status = $${paramIndex++}`); values.push(status); }
        if (name) { updates.push(`name = $${paramIndex++}`); values.push(name); }
        updates.push(`updated_at = NOW()`);

        if (status === 'active') updates.push(`started_at = COALESCE(started_at, NOW())`);
        if (status === 'completed') updates.push(`completed_at = NOW()`);

        values.push(id);
        const result = await pool.query(
            `UPDATE outreach_campaigns SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );

        return NextResponse.json({ campaign: result.rows[0] });
    } catch (error) {
        console.error("Error updating campaign:", error);
        return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
    }
}

// DELETE
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });

        await pool.query(`DELETE FROM outreach_campaigns WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting campaign:", error);
        return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
    }
}
