"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UploadRow } from "@/lib/queries";
import { ConfirmButton } from "./ConfirmButton";
import { EmptyState } from "./ui";

const SOURCE_LABEL: Record<string, string> = {
  sales: "Sales / POS",
  payroll: "Payroll / FTE",
  checklist: "JOLT checklist",
  reviews: "Guest reviews",
  notes: "Manager notes",
};

export function ImportHistory({ uploads }: { uploads: UploadRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  if (uploads.length === 0) {
    return <EmptyState title="No imports yet" hint="Uploaded files will appear here. Use the buttons above to import your exports or load the sample data." compact />;
  }

  async function undo(id: number) {
    setError(null);
    const res = await fetch(`/api/uploads/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Couldn't undo that import.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400">
            <th className="py-2 pr-4">File</th>
            <th className="py-2 pr-4">Source</th>
            <th className="py-2 pr-4">Imported</th>
            <th className="py-2 pr-4">Skipped</th>
            <th className="py-2 pr-4">When</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {uploads.map((u) => {
            const sourceLabel = SOURCE_LABEL[u.detected_source] ?? u.detected_source;
            return (
              <tr key={u.id} className="border-b border-zinc-100 last:border-0">
                <td className="py-2 pr-4 font-medium">{u.filename}</td>
                <td className="py-2 pr-4 text-zinc-600">{sourceLabel}</td>
                <td className="py-2 pr-4 text-emerald-700">{u.rows_imported}</td>
                <td className="py-2 pr-4 text-zinc-500">{u.rows_skipped}</td>
                <td className="py-2 pr-4 text-zinc-500">{u.uploaded_at}</td>
                <td className="py-2 text-right">
                  {u.is_latest_for_source ? (
                    <ConfirmButton label="Undo" confirmLabel="Remove import" busyLabel="Removing…" onConfirm={() => undo(u.id)} />
                  ) : (
                    <span
                      className="text-xs text-zinc-400"
                      title={`A later ${sourceLabel} import may have overwritten some of these rows. Only the most recent ${sourceLabel} import can be undone.`}
                    >
                      Can&rsquo;t undo
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
