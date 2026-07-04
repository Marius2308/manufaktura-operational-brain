"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionRow } from "@/lib/queries";
import { StatusBadge, EmptyState } from "./ui";
import { ConfirmButton } from "./ConfirmButton";

const STATUS_LABEL: Record<string, string> = { pending: "Pending", in_progress: "In progress", done: "Done" };
const STATUS_BADGE: Record<string, string> = { pending: "gray", in_progress: "yellow", done: "green" };

export function ActionsBoard({
  actions,
  locations,
  showAddForm = true,
}: {
  actions: ActionRow[];
  locations: { id: number; name: string }[];
  showAddForm?: boolean;
}) {
  const router = useRouter();
  const grouped = ["pending", "in_progress", "done"].map((s) => ({
    status: s,
    items: actions.filter((a) => a.status === s),
  }));

  return (
    <div className="space-y-6">
      {showAddForm && <AddActionForm locations={locations} onSaved={() => router.refresh()} />}
      {actions.length === 0 && (
        <EmptyState
          title="No action items yet"
          hint="Open a location, generate its daily briefing, and click “+ Track” on any recommendation to add it here — or add one manually above."
        />
      )}
      {grouped.map(
        (group) =>
          group.items.length > 0 && (
            <div key={group.status}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <StatusBadge status={STATUS_BADGE[group.status]} label={STATUS_LABEL[group.status]} />
                <span className="text-zinc-400 font-normal">{group.items.length}</span>
              </h3>
              <div className="space-y-2">
                {group.items.map((a) => (
                  <ActionCard key={a.id} action={a} onChanged={() => router.refresh()} />
                ))}
              </div>
            </div>
          )
      )}
    </div>
  );
}

function ActionCard({ action, onChanged }: { action: ActionRow; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [owner, setOwner] = useState(action.owner ?? "");
  const [deadline, setDeadline] = useState(action.deadline ?? "");
  const [followup, setFollowup] = useState(action.followup_note ?? "");
  const [saving, setSaving] = useState(false);

  async function patch(fields: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch(`/api/actions/${action.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    await fetch(`/api/actions/${action.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-zinc-900">
            {action.title}
            {action.source === "ai" && <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">AI</span>}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {action.location_name}
            {action.owner ? ` · owner: ${action.owner}` : " · unassigned"}
            {action.deadline ? ` · due ${action.deadline}` : ""}
          </p>
          {action.detail && <p className="mt-1 whitespace-pre-line text-xs text-zinc-400">{action.detail}</p>}
          {action.followup_note && (
            <p className="mt-1 text-xs text-emerald-700">
              <span className="font-semibold">Follow-up:</span> {action.followup_note}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <select
            value={action.status}
            disabled={saving}
            onChange={(e) => patch({ status: e.target.value })}
            className="rounded-md border border-zinc-300 px-1.5 py-1 text-xs"
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>
          <button onClick={() => setEditing(!editing)} className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50">
            {editing ? "Close" : "Edit"}
          </button>
          <ConfirmButton label="Delete" confirmLabel="Delete" busyLabel="Deleting…" onConfirm={remove} />
        </div>
      </div>

      {editing && (
        <div className="mt-3 grid gap-2 border-t border-zinc-100 pt-3 sm:grid-cols-3">
          <label className="text-xs text-zinc-600">
            Owner
            <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. M. Popescu" className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-zinc-600">
            Deadline
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-zinc-600 sm:col-span-3">
            Follow-up — did it work?
            <textarea value={followup} onChange={(e) => setFollowup(e.target.value)} rows={2} placeholder="e.g. Overtime back under 5% the following week." className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" />
          </label>
          <div className="sm:col-span-3">
            <button
              onClick={async () => {
                await patch({ owner, deadline, followup_note: followup });
                setEditing(false);
              }}
              disabled={saving}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddActionForm({ locations, onSaved }: { locations: { id: number; name: string }[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? 0);
  const [owner, setOwner] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700">
        + Add action
      </button>
    );

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm sm:col-span-2" />
        <select value={locationId} onChange={(e) => setLocationId(Number(e.target.value))} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Owner" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          disabled={!title || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await fetch("/api/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ location_id: locationId, title, owner: owner || null, deadline: deadline || null }),
              });
              setTitle(""); setOwner(""); setDeadline(""); setOpen(false);
              onSaved();
            } finally {
              setSaving(false);
            }
          }}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          Save
        </button>
        <button onClick={() => setOpen(false)} className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-100">Cancel</button>
      </div>
    </div>
  );
}
