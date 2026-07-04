import { getUploads } from "@/lib/queries";
import { ImportPanel } from "@/components/ImportPanel";
import { ImportHistory } from "@/components/ImportHistory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  const uploads = getUploads();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">Import data</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload exports from POS (sales), payroll/FTE, JOLT checklists, guest reviews, or manager notes.
          CSV and Excel are supported. Anomaly detection re-runs automatically after every import.
        </p>
      </div>

      <ImportPanel />

      <Card>
        <CardHeader>
          <CardTitle>Import history</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportHistory uploads={uploads} />
        </CardContent>
      </Card>
    </div>
  );
}
