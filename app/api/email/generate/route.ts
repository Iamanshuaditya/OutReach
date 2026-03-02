import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { lead, sender, tone, step_number, previous_emails } = body;

        if (!lead || !sender) {
            return NextResponse.json({ error: "Lead and sender data required" }, { status: 400 });
        }

        const apiKey = process.env.GROK_API_KEY;

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

Tone: ${tone || 'direct'}
Step: ${step_number || 1} of sequence

Respond ONLY with valid JSON:
{
  "subject": "Subject line",
  "subject_variants": ["Alt 1", "Alt 2"],
  "body": "Full email body",
  "personalized_first_line": "The opening line that references the lead specifically",
  "pain_angle": "What pain point this addresses",
  "cta": "The call to action used",
  "humanization_score": 85,
  "spam_risk_score": 12,
  "is_safe": true,
  "rejection_reason": null
}`;

        const userPrompt = `Write a cold email for:

RECIPIENT:
Name: ${lead.name || 'Unknown'}
Title: ${lead.title || 'Unknown'}
Company: ${lead.company || 'Unknown'}
Industry: ${lead.industry || 'Unknown'}
Location: ${lead.city || 'Unknown'}
${lead.linkedin_context ? `LinkedIn Context: ${lead.linkedin_context}` : ''}
${lead.company_context ? `Company Context: ${lead.company_context}` : ''}

SENDER:
Name: ${sender.name || 'Unknown'}
Company: ${sender.company || 'Unknown'}
Product: ${sender.product_description || 'Business solution'}
Value Prop: ${sender.value_proposition || 'Helping businesses grow'}

${previous_emails?.length ? `PREVIOUS EMAILS IN SEQUENCE:\n${previous_emails.join('\n---\n')}` : ''}

Write step ${step_number || 1} of the sequence.`;

        if (!apiKey) {
            // Fallback to template-based generation
            const firstName = (lead.name || 'there').split(' ')[0];
            return NextResponse.json({
                subject: `Quick thought on ${lead.company || 'your team'}`,
                subject_variants: [
                    `${firstName} — saw something about ${lead.company || 'your company'}`,
                    `Idea for ${lead.company || 'your company'} (90 sec read)`,
                ],
                body: `Hi ${firstName},\n\nI noticed you're ${lead.title || 'leading the charge'} at ${lead.company || 'your company'}. ${lead.industry ? `In the ${lead.industry} space` : 'In your industry'}, I've been seeing teams struggle with outbound that actually converts.\n\n${sender.company || 'We'} helps ${lead.industry || 'companies'} teams ${sender.value_proposition || 'close deals faster with better data'}.\n\nWould it make sense to chat for 10 min this week?\n\n${sender.name || 'Best'}`,
                personalized_first_line: `I noticed you're ${lead.title || 'leading the charge'} at ${lead.company || 'your company'}.`,
                pain_angle: `Outbound conversion rates in ${lead.industry || 'their industry'}`,
                cta: 'Would it make sense to chat for 10 min this week?',
                humanization_score: 72,
                spam_risk_score: 18,
                is_safe: true,
                rejection_reason: null,
            });
        }

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.9,
                max_tokens: 1200,
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            console.error("Groq API error:", err);
            return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";

        let parsed;
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
        } catch {
            return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
        }

        // Safety check — reject if spam score is too high
        if (parsed.spam_risk_score > 60) {
            parsed.is_safe = false;
            parsed.rejection_reason = `Spam risk score ${parsed.spam_risk_score} exceeds safe threshold (60). Please adjust tone or content.`;
        }

        return NextResponse.json(parsed);
    } catch (error) {
        console.error("Email generation error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
