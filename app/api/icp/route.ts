import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { prompt } = body;

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
        }

        const apiKey = process.env.GROK_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "API key not configured" }, { status: 500 });
        }

        const systemPrompt = `You are an AI ICP (Ideal Customer Profile) builder for a B2B leads database. 
Given a natural language description from a user, convert it into structured filter parameters.

Respond ONLY with valid JSON in this exact format:
{
  "playbook_name": "Short descriptive name",
  "explanation": "Brief explanation of how you interpreted the prompt",
  "variants": [
    {
      "label": "Variant name (e.g., 'C-Suite', 'VP/Directors', etc.)",
      "filters": {
        "titles_include": ["title1", "title2"],
        "titles_exclude": ["title to exclude"],
        "industries_include": ["industry1"],
        "company_size_range": [min, max] or null,
        "geo": {
          "countries": ["country"],
          "states": ["state"],
          "cities": ["city"]
        },
        "verification": {
          "min_confidence": 80,
          "freshness_days_max": 60,
          "exclude_catch_all": true,
          "exclude_disposable": true
        }
      }
    }
  ]
}

Generate 3-5 ICP variants based on the user's prompt. Each variant should target a different persona or segment within the described ICP. Be specific with job titles - use common variations. Always include verification settings.`;

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
                    { role: "user", content: prompt },
                ],
                temperature: 0.7,
                max_tokens: 2000,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Grok API error:", errorText);
            return NextResponse.json(
                { error: "AI service unavailable" },
                { status: 502 }
            );
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";

        // Extract JSON from the response
        let parsed;
        try {
            // Try to find JSON in the response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                parsed = JSON.parse(content);
            }
        } catch {
            console.error("Failed to parse AI response:", content);
            return NextResponse.json(
                { error: "Failed to parse AI response", raw: content },
                { status: 500 }
            );
        }

        return NextResponse.json({
            playbook_name: parsed.playbook_name || "Custom ICP",
            explanation: parsed.explanation || "Generated from your description",
            variants: parsed.variants || [],
            prompt,
        });
    } catch (error) {
        console.error("ICP Builder error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
