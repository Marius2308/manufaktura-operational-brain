"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "./ui";
import type { Briefing, RecommendedAction } from "@/lib/briefing/schema";

interface StoredBriefingDto {
  id: number;
  briefing_date: string;
  content: Briefing;
  generated_by: "claude" | "fallback";
  model: string | null;
  created_at: string;
}

export function BriefingPanel({ locationId, initial }: { locationId: number; initial: StoredBriefingDto | null }) {
  const [briefing, setBriefing] = useState<StoredBriefingDto | null>(initial);
  const [loading, setLoading] = useState(false);
  const [addedIdx, setAddedIdx] = useState<Set<number>>(new Set());
  const router = useRouter();

  async function regenerate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/briefings/generate?locationId=${locationId}`, { method: "POST" });
      if (res.ok) {
        setBriefing(await res.json());
        setAddedIdx(new Set());
      }
    } finally {
      setLoading(false);
    }
  }

  async function addAction(rec: RecommendedAction, idx: number) {
    const res = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location_id: locationId,
        briefing_id: briefing?.id ?? null,
        title: rec.action,
        detail: `Triggered by: ${rec.triggered_by}\nCheck back: ${rec.check_back}`,
        owner: rec.owner_role,
        source: "ai",
      }),
    });
    if (res.ok) {
      setAddedIdx(new Set([...addedIdx, idx]));
      router.refresh();
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">Daily briefing</h3>
          {briefing && (
            <span className="text-xs text-zinc-400">
              {briefing.generated_by === "claude"
                ? `AI-narrated by Claude (${briefing.model})`
                : "Generated from detected signals · connect Claude API for AI narration"}{" "}
              · data as of {briefing.briefing_date}
            </span>
          )}
        </div>
        <button
          onClick={regenerate}
          disabled={loading}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? "Generating…" : briefing ? "Regenerate" : "Generate briefing"}
        </button>
      </div>

      {!briefing ? (
        <p className="text-sm text-zinc-500">No briefing yet — click “Generate briefing”.</p>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex items-start gap-3">
            <StatusBadge status={briefing.content.status} />
            <p className="font-medium text-zinc-900">{briefing.content.headline}</p>
          </div>

          <Section title="What changed" items={briefing.content.what_changed} />
          <Section title="If nobody intervenes" items={briefing.content.key_risks} />
          <Section title="Likely causes" items={briefing.content.likely_causes} />

          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">What to do today</h4>
            <ul className="space-y-2">
              {briefing.content.recommended_actions.map((rec, i) => (
                <li key={i} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-900">{rec.action}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        <span className="font-semibold">Owner:</span> {rec.owner_role} ·{" "}
                        <span className="font-semibold">Check back:</span> {rec.check_back}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        <span className="font-semibold">Triggered by:</span> {rec.triggered_by}
                      </p>
                    </div>
                    <button
                      onClick={() => addAction(rec, i)}
                      disabled={addedIdx.has(i)}
                      className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                    >
                      {addedIdx.has(i) ? "Added ✓" : "+ Track"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h4>
      <ul className="list-disc space-y-1 pl-5 text-zinc-700">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
