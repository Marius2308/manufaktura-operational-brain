import { ReactNode } from "react";

/** Minimal shadcn-style primitives, styled with Tailwind. */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-zinc-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 pt-4 pb-2 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h3 className={`text-sm font-semibold text-zinc-900 ${className}`}>{children}</h3>;
}

export function CardContent({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 pb-4 ${className}`}>{children}</div>;
}

const STATUS_STYLES: Record<string, string> = {
  red: "bg-red-100 text-red-800 border-red-200",
  yellow: "bg-amber-100 text-amber-800 border-amber-200",
  green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  info: "bg-sky-100 text-sky-800 border-sky-200",
  gray: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${STATUS_STYLES[status] ?? STATUS_STYLES.gray}`}>
      {label ?? status}
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = { red: "bg-red-500", yellow: "bg-amber-400", green: "bg-emerald-500" };
  return <span className={`inline-block h-3 w-3 rounded-full ${colors[status] ?? "bg-zinc-300"}`} />;
}

/**
 * Professional empty state — used wherever a section has no data yet, instead
 * of a bare "no data" string. `action` is an optional CTA node.
 */
export function EmptyState({
  title,
  hint,
  action,
  compact = false,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 text-center ${compact ? "px-4 py-6" : "px-6 py-12"}`}>
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M18 9l-5 5-3-3-4 4" />
        </svg>
      </div>
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-zinc-400">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
