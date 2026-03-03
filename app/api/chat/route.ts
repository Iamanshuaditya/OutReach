import { NextRequest, NextResponse } from "next/server";
import {
  getDBSchema,
  formatSchemaForPrompt,
  validateSQL,
  executeSafeQuery,
} from "@/lib/chat-sql";
import type { ChatAPIRequest, ChatAPIResponse, ChatQueryResult } from "@/lib/chat-types";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3.5:4b";

export async function POST(request: NextRequest) {
  try {
    const body: ChatAPIRequest = await request.json();
    const { query, history } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json<ChatAPIResponse>(
        { explanation: "", error: "Query is required" },
        { status: 400 }
      );
    }

    // 1. Fetch DB schema
    const schema = await getDBSchema();
    const schemaText = formatSchemaForPrompt(schema);

    const systemPrompt = `You are a SQL assistant for LeadBase. Convert questions into PostgreSQL SELECT queries.

SCHEMA (table: columns):
${schemaText}

CRITICAL: Use ONLY the exact column names listed above. Never guess or invent column names.
Always quote table names with double quotes if they contain special characters.

Respond with ONLY a JSON object, no other text: {"sql": "SELECT ...", "explanation": "one sentence"}

Rules:
- SELECT only. No INSERT/UPDATE/DELETE/DROP.
- Use ILIKE for text search.
- LIMIT 50 by default.
- For counts: SELECT COUNT(*) AS count.
- If unrelated: {"sql": null, "explanation": "reason"}
- Keep explanation to 1 sentence, plain English, no SQL.
- Do NOT wrap the JSON in markdown code fences.`;

    // Keep last 6 messages for context
    const conversationMessages = (history || []).slice(-6).map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationMessages,
          { role: "user", content: query },
        ],
        stream: false,
        format: "json",
        options: {
          temperature: 0.3,
          num_predict: 2048,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Ollama error:", errorText);
      return NextResponse.json<ChatAPIResponse>(
        { explanation: "", error: "Local AI model unavailable. Make sure Ollama is running." },
        { status: 502 }
      );
    }

    const data = await response.json();
    const content = data.message?.content || "";

    // Parse LLM response — multiple fallback strategies
    let parsed: { sql?: string | null; explanation?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      try {
        // Strip markdown fences / thinking tags if present
        const stripped = content
          .replace(/<think>[\s\S]*?<\/think>/g, "")
          .replace(/```json?\s*/g, "")
          .replace(/```/g, "")
          .trim();
        const jsonMatch = stripped.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { sql: null, explanation: stripped };
      } catch {
        console.error("Failed to parse AI response:", content);
        return NextResponse.json<ChatAPIResponse>({
          explanation: "I couldn't process that query. Could you rephrase it?",
        });
      }
    }

    // Clean explanation — never show SQL or JSON artifacts to the user
    let explanation = parsed.explanation || "Here are the results.";
    explanation = explanation
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\{[\s\S]*\}/g, "")
      .replace(/SELECT\s[\s\S]*/i, "")
      .trim() || "Here are the results.";

    // If no SQL was generated (unrelated question)
    if (!parsed.sql) {
      return NextResponse.json<ChatAPIResponse>({ explanation });
    }

    // Validate the SQL
    const validation = validateSQL(parsed.sql);
    if (!validation.valid) {
      return NextResponse.json<ChatAPIResponse>({
        explanation: `I can't run that query: ${validation.reason}. I can only read data from the database.`,
      });
    }

    // Execute the query
    try {
      const { rows, rowCount } = await executeSafeQuery(parsed.sql);

      // Determine result type
      let result: ChatQueryResult;

      if (
        rows.length === 1 &&
        Object.keys(rows[0]).length === 1 &&
        ("count" in rows[0] || "total" in rows[0])
      ) {
        const countValue = Number(rows[0].count ?? rows[0].total);
        result = {
          type: "count",
          count: countValue,
          sql: parsed.sql,
          rowCount: 1,
        };
      } else {
        result = {
          type: "table",
          columns: rows.length > 0 ? Object.keys(rows[0]) : [],
          rows,
          sql: parsed.sql,
          rowCount,
        };
      }

      return NextResponse.json<ChatAPIResponse>({ explanation, result });
    } catch (queryError) {
      console.error("Query execution error:", queryError);
      const message =
        queryError instanceof Error ? queryError.message : "Query failed";
      return NextResponse.json<ChatAPIResponse>({
        explanation: `I generated a query but it failed to execute: ${message}. Let me know if you'd like me to try differently.`,
        result: { type: "error", sql: parsed.sql },
      });
    }
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json<ChatAPIResponse>(
      { explanation: "", error: "Internal server error" },
      { status: 500 }
    );
  }
}
