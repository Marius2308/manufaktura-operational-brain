import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "@/lib/db";
import { buildBriefingContext } from "./context";
import { BRIEFING_SYSTEM_PROMPT, buildBriefingUserPrompt } from "./prompt";
import { Briefing, BRIEFING_JSON_SCHEMA } from "./schema";
import { generateFallbackBriefing } from "./fallback";

/**
 * Briefing generation with graceful degradation:
 *   1. If Anthropic credentials are available, call Claude (model set by
 *      BRIEFING_MODEL, default claude-sonnet-5) with a JSON-schema-constrained
 *      output so the response always parses.
 *   2. On missing credentials or any API failure, fall back to the
 *      deterministic rule-based generator so the demo works offline.
 * The result is cached in the briefings table.
 */

const MODEL = process.env.BRIEFING_MODEL || "claude-sonnet-5";

export interface StoredBriefing {
  id: number;
  location_id: number;
  briefing_date: string;
  status: string;
  content: Briefing;
  generated_by: "claude" | "fallback";
  model: string | null;
  created_at: string;
}

export async function generateBriefing(locationId: number): Promise<StoredBriefing> {
  const ctx = buildBriefingContext(locationId);

  let briefing: Briefing | null = null;
  let generatedBy: "claude" | "fallback" = "fallback";
  let model: string | null = null;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        system: BRIEFING_SYSTEM_PROMPT,
        output_config: { format: { type: "json_schema", schema: BRIEFING_JSON_SCHEMA } },
        messages: [{ role: "user", content: buildBriefingUserPrompt(ctx) }],
      });
      const text = response.content.find((b) => b.type === "text");
      if (text && "text" in text) {
        briefing = JSON.parse(text.text) as Briefing;
        generatedBy = "claude";
        model = MODEL;
      }
    } catch (err) {
      console.error("Claude briefing generation failed; using rule-based fallback:", err);
    }
  }

  if (!briefing) briefing = generateFallbackBriefing(ctx);

  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO briefings (location_id, briefing_date, status, content_json, generated_by, model)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(locationId, ctx.asOfDate, briefing.status, JSON.stringify(briefing), generatedBy, model);

  return {
    id: Number(result.lastInsertRowid),
    location_id: locationId,
    briefing_date: ctx.asOfDate,
    status: briefing.status,
    content: briefing,
    generated_by: generatedBy,
    model,
    created_at: new Date().toISOString(),
  };
}

export function getLatestBriefing(locationId: number): StoredBriefing | null {
  const row = getDb()
    .prepare("SELECT * FROM briefings WHERE location_id = ? ORDER BY id DESC LIMIT 1")
    .get(locationId) as
    | (Omit<StoredBriefing, "content" | "generated_by"> & { content_json: string; generated_by: string })
    | undefined;
  if (!row) return null;
  return {
    ...row,
    generated_by: row.generated_by as "claude" | "fallback",
    content: JSON.parse(row.content_json) as Briefing,
  };
}
