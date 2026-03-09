import pool from "@/lib/db";
import { env } from "@/lib/env";
import { buildSchedule } from "@/lib/email/scheduler";
import { loadCampaignLeads, type CampaignLead } from "@/lib/email/lead-source";
import { logOperation } from "@/lib/email/ops-logger";

async function generateAIEmail(
  lead: CampaignLead,
  sender: { name: string; company: string; product_description: string; value_proposition: string },
  tone: string,
  stepNumber: number,
): Promise<{ subject: string; body: string }> {
  const firstName = lead.firstName || "there";
  const raw = lead.raw || {};

  // If Groq API key is available, use AI generation
  if (env.GROQ_API_KEY) {
    try {
      const systemPrompt = `You are an expert cold email writer for B2B outbound sales. You write hyper-personalized, non-spammy emails that feel human.

RULES:
- Never use spammy language (free, limited time, act now, etc.)
- Never include HTML or formatting
- Keep emails under 120 words
- Always include a personalized first line based on the lead's role/company
- Use a soft CTA (question, not a demand)
- Vary sentence length and structure
- Sound like a real person, not a template
- If this is a follow-up email (step > 1), reference the previous outreach naturally

Tone: ${tone || "direct"}
Step: ${stepNumber} of sequence

Respond ONLY with valid JSON:
{"subject": "Subject line", "body": "Full email body"}`;

      const userPrompt = `Write a cold email for:

RECIPIENT:
Name: ${lead.firstName} ${lead.lastName}
Title: ${raw.title || "Unknown"}
Company: ${lead.company || "Unknown"}
Industry: ${raw.industry || "Unknown"}

SENDER:
Name: ${sender.name || "Unknown"}
Company: ${sender.company || "Unknown"}
Product: ${sender.product_description || "Business solution"}
Value Prop: ${sender.value_proposition || "Helping businesses grow"}

Write step ${stepNumber} of the sequence.`;

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.9,
          max_tokens: 800,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content ?? "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.subject && parsed.body) {
            return { subject: parsed.subject, body: parsed.body };
          }
        }
      }
    } catch (err) {
      console.error("AI generation failed, using fallback:", err);
    }
  }

  // Fallback: generate a decent template-based email
  const company = lead.company || "your company";
  const title = (raw.title as string) || "leading the charge";
  const industry = (raw.industry as string) || "";

  if (stepNumber === 1) {
    return {
      subject: `Quick thought on ${company}`,
      body: `Hi ${firstName},\n\nI noticed you're ${title} at ${company}.${industry ? ` In the ${industry} space,` : ""} I've been seeing teams struggle with building products that actually ship on time.\n\n${sender.company} helps companies go from MVP to funded — we build, launch, and iterate fast so founders can focus on growth.\n\nWould it make sense to chat for 10 min this week?\n\n${sender.name}`,
    };
  }

  // Follow-up
  return {
    subject: `Re: Quick thought on ${company}`,
    body: `Hi ${firstName},\n\nJust wanted to follow up on my last note. I know things get busy.\n\nWe've been helping companies like yours ship MVPs in weeks, not months — and use that momentum to raise funding.\n\nWorth a quick chat?\n\n${sender.name}`,
  };
}

type CampaignStepRow = {
  id: string;
  step_number: number;
  type: "email" | "wait" | "condition";
  subject_template: string;
  body_template: string;
  wait_days: number;
  ai_personalize: boolean;
  tone: string;
};

type CampaignRow = {
  id: string;
  org_id: string;
  status: string;
  lead_source: string | null;
  lead_count: number;
  window_start_hour: number;
  window_end_hour: number;
  window_timezone: string;
  window_days: string[];
  min_interval_seconds: number;
  max_interval_seconds: number;
  randomize_interval: boolean;
  sender_name: string;
  sender_company: string;
  product_description: string;
  value_proposition: string;
};

function substituteTemplate(template: string, lead: CampaignLead): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, rawKey) => {
    const key = String(rawKey).toLowerCase();
    if (key === "first_name") return lead.firstName;
    if (key === "last_name") return lead.lastName;
    if (key === "company") return lead.company;
    if (key === "email") return lead.email;
    // Extended fields from segment lead_data
    if (key === "title" && lead.raw.title) return String(lead.raw.title);
    if (key === "industry" && lead.raw.industry) return String(lead.raw.industry);
    return "";
  });
}

function getEmailStepsWithOffsets(
  steps: CampaignStepRow[]
): Array<{ step: CampaignStepRow; offsetDays: number }> {
  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);

  let offsetDays = 0;
  const result: Array<{ step: CampaignStepRow; offsetDays: number }> = [];

  for (const step of sorted) {
    if (step.type === "wait") {
      offsetDays += Math.max(0, step.wait_days ?? 0);
      continue;
    }

    if (step.type === "condition") {
      // Condition steps act as a gate — skip for now (MVP: treat as pass-through)
      continue;
    }

    result.push({ step, offsetDays });
  }

  return result;
}

function atOffsetDays(isoDate: string, days: number): string {
  const base = new Date(isoDate);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString();
}

export type ActivateCampaignResult = {
  campaignId: string;
  queuedLeads: number;
  queuedEmails: number;
};

export async function activateCampaign(
  campaignId: string,
  orgId: string,
  actorUserId?: string
): Promise<ActivateCampaignResult> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const campaignResult = await client.query(
      `SELECT * FROM outreach_campaigns WHERE id = $1 AND org_id = $2 FOR UPDATE`,
      [campaignId, orgId]
    );

    if (campaignResult.rows.length === 0) {
      throw new Error("Campaign not found");
    }

    const campaign = campaignResult.rows[0] as CampaignRow;

    if (!campaign.lead_source) {
      throw new Error("Campaign lead source is required before activation");
    }

    const stepsResult = await client.query(
      `SELECT * FROM outreach_campaign_steps
       WHERE campaign_id = $1
       ORDER BY step_number ASC`,
      [campaignId]
    );

    const steps = stepsResult.rows as CampaignStepRow[];

    if (steps.length === 0) {
      throw new Error("Campaign requires at least one step");
    }

    const emailSteps = getEmailStepsWithOffsets(steps);

    if (emailSteps.length === 0) {
      throw new Error("Campaign requires at least one email step");
    }

    const inboxesResult = await client.query(
      `SELECT i.id, i.email, i.display_name, i.daily_limit, i.daily_sent
       FROM outreach_campaign_inboxes ci
       JOIN outreach_inboxes i ON i.id = ci.inbox_id
       JOIN outreach_domains d ON d.id = i.domain_id
       WHERE ci.campaign_id = $1
         AND i.org_id = $2
         AND i.is_active = true
         AND d.can_send = true`,
      [campaignId, orgId]
    );

    if (inboxesResult.rows.length === 0) {
      throw new Error("No active sending inboxes are assigned to this campaign");
    }

    const maxLeads =
      campaign.lead_count && campaign.lead_count > 0 ? campaign.lead_count : 500;
    const leads = await loadCampaignLeads(campaign.lead_source, maxLeads);

    if (leads.length === 0) {
      throw new Error("No valid leads found in campaign lead source");
    }

    const suppressionResult = await client.query(
      `SELECT email FROM outreach_suppression WHERE org_id = $1`,
      [orgId]
    );

    const suppressed = new Set(
      suppressionResult.rows.map((row) => String(row.email).toLowerCase())
    );

    const eligibleLeads = leads.filter((lead) => !suppressed.has(lead.email));

    if (eligibleLeads.length === 0) {
      throw new Error("All selected leads are suppressed");
    }

    const schedule = buildSchedule({
      leadCount: eligibleLeads.length,
      inboxes: inboxesResult.rows.map((row) => ({
        id: String(row.id),
        dailyLimit: Number(row.daily_limit ?? 0),
        dailySent: Number(row.daily_sent ?? 0),
      })),
      windowStartHour: campaign.window_start_hour,
      windowEndHour: campaign.window_end_hour,
      timezone: campaign.window_timezone || "America/New_York",
      windowDays: campaign.window_days || ["mon", "tue", "wed", "thu", "fri"],
      minIntervalSeconds: Math.max(30, campaign.min_interval_seconds || 180),
      maxIntervalSeconds: Math.max(
        campaign.min_interval_seconds || 180,
        campaign.max_interval_seconds || 420
      ),
      randomizeInterval: campaign.randomize_interval !== false,
      skipWeekends: !(campaign.window_days || []).some(
        (day) => day === "sat" || day === "sun"
      ),
    });

    if (schedule.length !== eligibleLeads.length) {
      throw new Error("Failed to compute campaign schedule for all leads");
    }

    const pendingQueueResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM outreach_send_queue
       WHERE campaign_id = $1
         AND org_id = $2
         AND status IN ('pending', 'sending')`,
      [campaignId, orgId]
    );

    if (Number(pendingQueueResult.rows[0]?.count ?? 0) > 0) {
      // Clear stale queue items from previous failed activation attempts
      await client.query(
        `DELETE FROM outreach_send_queue
         WHERE campaign_id = $1 AND org_id = $2 AND status IN ('pending', 'sending')`,
        [campaignId, orgId]
      );
      await client.query(
        `DELETE FROM outreach_lead_states
         WHERE campaign_id = $1 AND org_id = $2 AND status = 'active'`,
        [campaignId, orgId]
      );
    }

    let totalQueued = 0;

    for (const scheduled of schedule) {
      const lead = eligibleLeads[scheduled.index];

      await client.query(
        `INSERT INTO outreach_lead_states
           (org_id, campaign_id, lead_id, email, status)
         VALUES
           ($1, $2, $3, $4, 'active')
         ON CONFLICT (org_id, campaign_id, email)
         DO UPDATE SET status = 'active', last_event_at = NOW()`,
        [orgId, campaignId, lead.leadId, lead.email]
      );

      for (const emailStep of emailSteps) {
        let subject: string;
        let body: string;

        const needsAI =
          emailStep.step.ai_personalize &&
          !emailStep.step.subject_template &&
          !emailStep.step.body_template;

        if (needsAI) {
          const generated = await generateAIEmail(
            lead,
            {
              name: campaign.sender_name,
              company: campaign.sender_company,
              product_description: campaign.product_description,
              value_proposition: campaign.value_proposition,
            },
            emailStep.step.tone || "direct",
            emailStep.step.step_number,
          );
          subject = generated.subject;
          body = generated.body;
        } else {
          subject = substituteTemplate(emailStep.step.subject_template, lead);
          body = substituteTemplate(emailStep.step.body_template, lead);
        }

        await client.query(
          `INSERT INTO outreach_send_queue
             (org_id, campaign_id, step_number, lead_id, inbox_id,
              recipient_email, recipient_name, lead_payload,
              subject, body, status, scheduled_at)
           VALUES
             ($1, $2, $3, $4, $5,
              $6, $7, $8::jsonb,
              $9, $10, 'pending', $11)`,
          [
            orgId,
            campaignId,
            emailStep.step.step_number,
            lead.leadId,
            scheduled.inboxId,
            lead.email,
            `${lead.firstName} ${lead.lastName}`.trim() || null,
            JSON.stringify({
              first_name: lead.firstName,
              last_name: lead.lastName,
              company: lead.company,
              email: lead.email,
              source: campaign.lead_source,
              raw: lead.raw,
            }),
            subject,
            body,
            atOffsetDays(scheduled.scheduledAt, emailStep.offsetDays),
          ]
        );

        totalQueued += 1;
      }
    }

    await client.query(
      `UPDATE outreach_campaigns
       SET status = 'active',
           started_at = COALESCE(started_at, NOW()),
           last_run_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND org_id = $2`,
      [campaignId, orgId]
    );

    // If lead source is a segment, tag the leads as queued
    if (campaign.lead_source && campaign.lead_source.startsWith("segment::")) {
      const segmentEmails = eligibleLeads.map((l) => l.email);
      if (segmentEmails.length > 0) {
        await client.query(
          `UPDATE lead_segments
           SET outreach_status = 'queued', campaign_tag = $1
           WHERE email = ANY($2) AND outreach_status = 'new'`,
          [campaignId, segmentEmails]
        );
      }
    }

    await client.query("COMMIT");

    await logOperation({
      orgId,
      campaignId,
      logType: "campaign_activation",
      level: "info",
      message: "Campaign activated and queue generated",
      metadata: {
        actorUserId: actorUserId ?? null,
        queuedLeads: eligibleLeads.length,
        queuedEmails: totalQueued,
        leadSource: campaign.lead_source,
      },
    });

    return {
      campaignId,
      queuedLeads: eligibleLeads.length,
      queuedEmails: totalQueued,
    };
  } catch (error) {
    await client.query("ROLLBACK");

    await logOperation({
      orgId,
      campaignId,
      logType: "campaign_activation",
      level: "error",
      message: "Campaign activation failed",
      metadata: {
        actorUserId: actorUserId ?? null,
        error: error instanceof Error ? error.message : "Unknown activation error",
      },
    });

    throw error;
  } finally {
    client.release();
  }
}
