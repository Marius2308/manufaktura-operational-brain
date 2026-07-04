/**
 * Structured shape of a daily briefing — identical whether produced by the
 * Claude API (JSON-schema-enforced output) or the rule-based fallback.
 */

export interface RecommendedAction {
  action: string;      // what to do today
  owner_role: string;  // who should own it (e.g. "Location Manager", "Ops Director")
  triggered_by: string; // the specific data point that triggered this recommendation
  check_back: string;  // when/how to verify it worked
}

export interface Briefing {
  status: "red" | "yellow" | "green";
  headline: string;          // one-sentence answer to "what is happening?"
  what_changed: string[];    // notable changes vs the prior period
  key_risks: string[];       // what happens if nobody intervenes
  likely_causes: string[];   // why it is happening (connecting metrics + manager notes)
  recommended_actions: RecommendedAction[];
}

/** JSON Schema used to force Claude's output into the Briefing shape. */
export const BRIEFING_JSON_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["red", "yellow", "green"] },
    headline: { type: "string" },
    what_changed: { type: "array", items: { type: "string" } },
    key_risks: { type: "array", items: { type: "string" } },
    likely_causes: { type: "array", items: { type: "string" } },
    recommended_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string" },
          owner_role: { type: "string" },
          triggered_by: { type: "string" },
          check_back: { type: "string" },
        },
        required: ["action", "owner_role", "triggered_by", "check_back"],
        additionalProperties: false,
      },
    },
  },
  required: ["status", "headline", "what_changed", "key_risks", "likely_causes", "recommended_actions"],
  additionalProperties: false,
} as const;
