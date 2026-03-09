import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/multi-tenant";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { prompt, save } = body;

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

        const playbookName = parsed.playbook_name || "Custom ICP";
        const explanation = parsed.explanation || "Generated from your description";
        const variants = parsed.variants || [];

        // If save=true, persist to icp_definitions table
        let saved_id: string | null = null;
        if (save) {
            const auth = await requireOrgContext(request);
            if (auth.ok) {
                const slug = playbookName
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "")
                    .slice(0, 80);

                const filters = variants[0]?.filters || {};
                const icpFilters = {
                    titles_include: filters.titles_include || [],
                    titles_exclude: filters.titles_exclude || [],
                    industries_include: filters.industries_include || [],
                    industries_exclude: [],
                    employee_count_range: filters.company_size_range || null,
                    revenue_range: null,
                    funding_stages: [],
                    countries: filters.geo?.countries || [],
                    states: filters.geo?.states || [],
                    cities: filters.geo?.cities || [],
                    company_keywords: [],
                    domain_patterns: [],
                };

                const result = await pool.query(
                    `INSERT INTO icp_definitions
                      (org_id, name, slug, description, filters)
                     VALUES ($1, $2, $3, $4, $5::jsonb)
                     ON CONFLICT (org_id, slug) DO UPDATE SET
                       name = EXCLUDED.name,
                       description = EXCLUDED.description,
                       filters = EXCLUDED.filters,
                       updated_at = NOW()
                     RETURNING id`,
                    [
                        auth.context.orgId,
                        playbookName,
                        slug,
                        explanation,
                        JSON.stringify(icpFilters),
                    ]
                );
                saved_id = result.rows[0]?.id ?? null;
            }
        }

        return NextResponse.json({
            playbook_name: playbookName,
            explanation,
            variants,
            prompt,
            saved_id,
        });
    } catch (error) {
        console.error("ICP Builder error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
