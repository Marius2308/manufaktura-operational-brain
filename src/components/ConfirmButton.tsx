"use client";

import { useState } from "react";

/**
 * Inline confirm for destructive actions — avoids a modal library. First click
 * swaps the button for a "Confirm? / Cancel" pair; the action only fires on the
 * explicit confirm. Used for undoing an import and deleting an action item.
 */
export function ConfirmButton({
  label,
  confirmLabel = "Confirm",
  onConfirm,
  className = "",
  busyLabel = "Working…",
}: {
  label: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  className?: string;
  busyLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (busy) {
    return <span className="text-xs text-zinc-400">{busyLabel}</span>;
  }

  if (armed) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
              setArmed(false);
            }
          }}
          className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          {confirmLabel}
        </button>
        <button onClick={() => setArmed(false)} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50">
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button onClick={() => setArmed(true)} className={className || "rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"}>
      {label}
    </button>
  );
}
