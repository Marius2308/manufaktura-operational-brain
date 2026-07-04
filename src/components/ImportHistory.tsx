"use client";

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

  if (uploads.length === 0) {
    return <EmptyState title="No imports yet" hint="Uploaded files will appear here. Use the buttons above to import your exports or load the sample data." compact />;
  }

  async function undo(id: number) {
    await fetch(`/api/uploads/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
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
        {uploads.map((u) => (
          <tr key={u.id} className="border-b border-zinc-100 last:border-0">
            <td className="py-2 pr-4 font-medium">{u.filename}</td>
            <td className="py-2 pr-4 text-zinc-600">{SOURCE_LABEL[u.detected_source] ?? u.detected_source}</td>
            <td className="py-2 pr-4 text-emerald-700">{u.rows_imported}</td>
            <td className="py-2 pr-4 text-zinc-500">{u.rows_skipped}</td>
            <td className="py-2 pr-4 text-zinc-500">{u.uploaded_at}</td>
            <td className="py-2 text-right">
              <ConfirmButton label="Undo" confirmLabel="Remove import" busyLabel="Removing…" onConfirm={() => undo(u.id)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
