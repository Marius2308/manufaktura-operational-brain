import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocationDetail, getActions } from "@/lib/queries";
import { getLatestBriefing } from "@/lib/briefing/generate";
import { Card, CardContent, CardHeader, CardTitle, StatusBadge, EmptyState } from "@/components/ui";
import { SalesChart, LaborChart, ChecklistChart, RatingsChart } from "@/components/Charts";
import { BriefingPanel } from "@/components/BriefingPanel";
import { ActionsBoard } from "@/components/ActionsBoard";

export const dynamic = "force-dynamic";

export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = getLocationDetail(Number(id));
  if (!detail) notFound();

  const briefing = getLatestBriefing(detail.id);
  const actions = getActions(detail.id);
  const activeAnomalies = detail.anomalies.filter((a) => !a.is_one_off && !a.is_resolved && a.severity !== "info");
  const contextAnomalies = detail.anomalies.filter((a) => a.is_one_off || a.is_resolved || a.severity === "info");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-600">← All locations</Link>
          <h1 className="text-lg font-bold">{detail.name}</h1>
          <StatusBadge status={detail.status} />
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <BriefingPanel
            locationId={detail.id}
            initial={
              briefing
                ? {
                    id: briefing.id,
                    briefing_date: briefing.briefing_date,
                    content: briefing.content,
                    generated_by: briefing.generated_by,
                    model: briefing.model,
                    created_at: briefing.created_at,
                  }
                : null
            }
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Daily net sales (RON)</CardTitle></CardHeader>
          <CardContent><SalesChart data={detail.sales} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Labor cost % of sales (weekly, dashed lines = 32% / 38% thresholds)</CardTitle></CardHeader>
          <CardContent><LaborChart data={detail.labor} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Checklist scores (dashed lines = 85% / 75% thresholds)</CardTitle></CardHeader>
          <CardContent><ChecklistChart data={detail.checklist} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Guest review ratings</CardTitle></CardHeader>
          <CardContent><RatingsChart data={detail.reviews} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Detected anomalies</CardTitle></CardHeader>
          <CardContent>
            {detail.anomalies.length === 0 ? (
              <EmptyState title="No anomalies detected" hint="Every metric for this location is within its normal range." compact />
            ) : (
              <ul className="space-y-2 text-sm">
                {activeAnomalies.map((a) => (
                  <li key={a.id} className="rounded-lg border border-zinc-200 p-2.5">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={a.severity} />
                      <span className="text-xs font-mono text-zinc-400">{a.rule_key}</span>
                      <span className="text-xs text-zinc-400">{a.detected_for_date}</span>
                    </div>
                    <p className="mt-1 text-zinc-700">{a.description}</p>
                  </li>
                ))}
                {contextAnomalies.length > 0 && (
                  <li className="pt-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Context (one-off / resolved — not counted against status)
                  </li>
                )}
                {contextAnomalies.map((a) => (
                  <li key={a.id} className="rounded-lg border border-dashed border-zinc-200 p-2.5 opacity-75">
                    <div className="flex items-center gap-2">
                      <StatusBadge status="info" label={a.is_resolved ? "resolved" : "one-off"} />
                      <span className="text-xs font-mono text-zinc-400">{a.rule_key}</span>
                      <span className="text-xs text-zinc-400">{a.detected_for_date}</span>
                    </div>
                    <p className="mt-1 text-zinc-600">{a.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Manager notes</CardTitle></CardHeader>
          <CardContent>
            {detail.notes.length === 0 ? (
              <EmptyState title="No manager notes" hint="Notes imported for this location will appear here as a timeline." compact />
            ) : (
              <ul className="space-y-2 text-sm">
                {detail.notes.map((n, i) => (
                  <li key={i} className="rounded-lg bg-zinc-50 p-2.5">
                    <p className="text-xs text-zinc-400">{n.date} · {n.author ?? "unknown"}</p>
                    <p className="mt-0.5 text-zinc-700">{n.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Actions for {detail.name}</CardTitle></CardHeader>
        <CardContent>
          <ActionsBoard actions={actions} locations={[{ id: detail.id, name: detail.name }]} showAddForm={true} />
        </CardContent>
      </Card>
    </div>
  );
}
