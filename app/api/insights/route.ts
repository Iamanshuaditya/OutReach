import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { lead } = body;

        if (!lead) {
            return NextResponse.json({ error: "Lead data required" }, { status: 400 });
        }

        const apiKey = process.env.GROK_API_KEY;
        if (!apiKey) {
            // Fallback to generated insights
            return NextResponse.json({
                tldr: `${lead.title || 'Professional'} at ${lead.company || 'their company'}. Potential decision-maker for business solutions.`,
                why_relevant: `${lead.name || 'This contact'} holds a ${lead.title || 'key'} role at ${lead.company || 'their organization'}, making them a potential buyer or influencer.`,
                pitch_angle: `Lead with value. Reference challenges specific to ${lead.title || 'their role'}. Focus on ROI and outcomes.`,
                subject_lines: [
                    `Quick question for ${lead.name?.split(' ')[0] || 'you'}`,
                    `Idea for ${lead.company || 'your team'} — 2 min read`,
                    `${lead.company || 'Your company'} + [Your Company] = ?`,
                ],
                objections: [
                    { objection: "We already have a solution", rebuttal: "Totally understand. Most teams I talk to did too — they switched because of better data quality. Worth a quick comparison?" },
                    { objection: "Not the right time", rebuttal: "Makes sense. When would be better? I can send a resource in the meantime that might be useful." },
                    { objection: "Send me info", rebuttal: "Absolutely. I'll send a case study from a similar company. Would a 10-min walkthrough next week help too?" },
                ],
                tone: "direct",
            });
        }

        const systemPrompt = `You are a B2B sales intelligence assistant. Given a lead's information, generate personalized outreach insights.

Respond ONLY with valid JSON:
{
  "tldr": "One-line summary of who this person is and why they matter",
  "why_relevant": "Why this lead is worth reaching out to",
  "pitch_angle": "Best approach to pitch to this person",
  "subject_lines": ["Subject line 1", "Subject line 2", "Subject line 3"],
  "objections": [
    {"objection": "Common objection", "rebuttal": "How to handle it"}
  ],
  "tone": "direct"
}`;

        const userPrompt = `Generate outreach insights for this lead:
Name: ${lead.name || 'Unknown'}
Title: ${lead.title || 'Unknown'}
Company: ${lead.company || 'Unknown'}
Industry: ${lead.industry || 'Unknown'}
Location: ${[lead.city, lead.state, lead.country].filter(Boolean).join(', ') || 'Unknown'}`;

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
                temperature: 0.8,
                max_tokens: 1000,
            }),
        });

        if (!response.ok) {
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

        return NextResponse.json(parsed);
    } catch (error) {
        console.error("Insight generation error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
