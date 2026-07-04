import Link from "next/link";
import { getOverview } from "@/lib/queries";
import { Card, CardContent, StatusDot, StatusBadge, EmptyState } from "@/components/ui";
import { Sparkline } from "@/components/Charts";

export const dynamic = "force-dynamic";

export default function OverviewPage() {
  const locations = getOverview();
  const noData = locations.every((l) => !l.hasData);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">All locations</h1>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1"><StatusDot status="green" /> healthy</span>
          <span className="flex items-center gap-1"><StatusDot status="yellow" /> needs attention</span>
          <span className="flex items-center gap-1"><StatusDot status="red" /> intervene today</span>
        </div>
      </div>

      {noData ? (
        <EmptyState
          title="No data imported yet"
          hint="Import your POS, payroll, checklist, review, and manager-note exports to see each location's status, briefings, and recommended actions."
          action={
            <Link href="/import" className="inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Go to Import
            </Link>
          }
        />
      ) : (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((loc) => (
          <Link key={loc.id} href={`/locations/${loc.id}`}>
            <Card className="transition hover:shadow-md">
              <CardContent className="pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusDot status={loc.hasData ? loc.status : "gray"} />
                    <span className="font-semibold">{loc.name}</span>
                  </div>
                  {loc.hasData && <StatusBadge status={loc.status} />}
                </div>
                <Sparkline data={loc.salesSeries} />
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-zinc-600">
                  <span>
                    7-day sales avg:{" "}
                    <span className="font-medium text-zinc-900">
                      {loc.last7Avg !== null ? `${loc.last7Avg.toLocaleString()} RON` : "—"}
                    </span>
                  </span>
                  <span>
                    WoW:{" "}
                    <span className={`font-medium ${loc.changePct !== null && loc.changePct < -5 ? "text-red-600" : loc.changePct !== null && loc.changePct > 5 ? "text-emerald-600" : "text-zinc-900"}`}>
                      {loc.changePct !== null ? `${loc.changePct > 0 ? "+" : ""}${loc.changePct}%` : "—"}
                    </span>
                  </span>
                  <span>
                    Checklist: <span className="font-medium text-zinc-900">{loc.latestChecklist !== null ? `${loc.latestChecklist}%` : "—"}</span>
                  </span>
                  <span>
                    Rating (10d): <span className="font-medium text-zinc-900">{loc.recentRating !== null ? `${loc.recentRating}/5` : "—"}</span>
                  </span>
                  <span>
                    Active signals: <span className="font-medium text-zinc-900">{loc.activeAnomalies}</span>
                  </span>
                  <span>
                    Open actions: <span className="font-medium text-zinc-900">{loc.openActions}</span>
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      )}
    </div>
  );
}
