"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportResult } from "@/lib/import/importer";

export function ImportPanel() {
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function upload(files: FileList) {
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    await run(fetch("/api/import", { method: "POST", body: form }));
    if (fileInput.current) fileInput.current.value = "";
  }

  async function loadSample() {
    await run(fetch("/api/import?sample=1", { method: "POST" }));
  }

  async function run(promise: Promise<Response>) {
    setBusy(true);
    setFailed(null);
    try {
      const res = await promise;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFailed(body.error ?? `Import failed (HTTP ${res.status}).`);
        setResults(null);
        return;
      }
      const data = await res.json();
      setResults(data.results ?? []);
      router.refresh();
    } catch {
      setFailed("Could not reach the server. Check that the app is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  const totals = results?.reduce(
    (t, r) => ({ added: t.added + r.added, updated: t.updated + r.updated, skipped: t.skipped + r.skipped, unchanged: t.unchanged + r.unchanged }),
    { added: 0, updated: 0, skipped: 0, unchanged: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files && e.target.files.length > 0 && upload(e.target.files)}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {busy ? "Importing…" : "Upload CSV / Excel files"}
        </button>
        <button
          onClick={loadSample}
          disabled={busy}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Load sample data
        </button>
        <span className="text-xs text-zinc-400">
          Source type is auto-detected from each file&apos;s headers; messy location names and date formats are normalized on import.
        </span>
      </div>

      {failed && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{failed}</div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2">
          {totals && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
              <span className="font-semibold">Import complete.</span>{" "}
              {totals.added > 0 && <>{totals.added} new record{totals.added === 1 ? "" : "s"} added. </>}
              {totals.updated > 0 && <>{totals.updated} existing record{totals.updated === 1 ? "" : "s"} updated. </>}
              {totals.unchanged > 0 && <>{totals.unchanged} duplicate{totals.unchanged === 1 ? "" : "s"} skipped. </>}
              {totals.skipped > 0 && <span className="text-amber-700">{totals.skipped} row{totals.skipped === 1 ? "" : "s"} could not be read.</span>}
              {totals.added === 0 && totals.updated === 0 && totals.skipped === 0 && <>No changes — this data was already imported.</>}
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {results.map((r, i) => (
              <div key={i} className="border-b border-zinc-100 px-4 py-3 text-sm last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-medium text-zinc-900">{r.filename}</span>
                    <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{r.source ?? "unrecognized"}</span>
                  </div>
                  {r.error ? (
                    <span className="shrink-0 text-xs font-medium text-red-600">Not imported</span>
                  ) : (
                    <span className="shrink-0 text-xs font-medium text-emerald-700">✓ imported</span>
                  )}
                </div>
                {r.error ? (
                  <p className="mt-1 text-xs text-red-600">{r.error}</p>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">
                    {r.dateFrom && r.dateTo && (
                      <>
                        Covers {r.dateFrom === r.dateTo ? r.dateFrom : `${r.dateFrom} → ${r.dateTo}`} ·{" "}
                      </>
                    )}
                    <span className="text-emerald-700 font-medium">{r.added} added</span>
                    {r.updated > 0 && <>, <span className="text-blue-700 font-medium">{r.updated} updated</span></>}
                    {r.unchanged > 0 && <>, {r.unchanged} duplicate{r.unchanged === 1 ? "" : "s"} skipped</>}
                    {r.skipped > 0 && <>, <span className="text-amber-700">{r.skipped} unreadable</span></>}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
