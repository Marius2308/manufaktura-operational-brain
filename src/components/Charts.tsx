"use client";

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, BarChart, Bar, ReferenceLine, ScatterChart, Scatter, ZAxis,
} from "recharts";

const AXIS = { fontSize: 11, stroke: "#a1a1aa" };

function NoData({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-zinc-200 text-xs text-zinc-400">
      No {label} data yet
    </div>
  );
}

export function Sparkline({ data }: { data: { date: string; net_sales: number }[] }) {
  if (data.length === 0) return <div className="h-12 text-xs text-zinc-400">no data</div>;
  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="net_sales" stroke="#3b82f6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SalesChart({ data }: { data: { date: string; net_sales: number }[] }) {
  if (data.length === 0) return <NoData label="sales" />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
        <XAxis dataKey="date" {...AXIS} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis {...AXIS} width={55} />
        <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} RON`, "Net sales"]} />
        <Line type="monotone" dataKey="net_sales" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LaborChart({ data }: { data: { week: string; laborPct: number | null }[] }) {
  const rows = data.filter((d) => d.laborPct !== null);
  if (rows.length === 0) return <NoData label="labor" />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
        <XAxis dataKey="week" {...AXIS} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis {...AXIS} width={40} unit="%" />
        <Tooltip formatter={(v) => [`${v}%`, "Labor % of sales"]} />
        {/* 32% = warning threshold, 38% = critical (documented in rules.ts) */}
        <ReferenceLine y={32} stroke="#f59e0b" strokeDasharray="4 4" />
        <ReferenceLine y={38} stroke="#ef4444" strokeDasharray="4 4" />
        <Bar dataKey="laborPct" fill="#8b5cf6" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChecklistChart({ data }: { data: { date: string; score_pct: number }[] }) {
  if (data.length === 0) return <NoData label="checklist" />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
        <XAxis dataKey="date" {...AXIS} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis {...AXIS} width={40} domain={[50, 100]} unit="%" />
        <Tooltip formatter={(v) => [`${v}%`, "Checklist score"]} />
        <ReferenceLine y={85} stroke="#f59e0b" strokeDasharray="4 4" />
        <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="score_pct" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RatingsChart({ data }: { data: { date: string; rating: number }[] }) {
  if (data.length === 0) return <NoData label="review" />;
  const rows = [...data].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
        <XAxis dataKey="date" {...AXIS} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis dataKey="rating" {...AXIS} width={30} domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]} />
        <ZAxis range={[40, 40]} />
        <Tooltip formatter={(v, name) => (name === "rating" ? [`${v}/5`, "Rating"] : [v, name])} />
        <ReferenceLine y={3.5} stroke="#f59e0b" strokeDasharray="4 4" />
        <Scatter data={rows} fill="#f97316" isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
