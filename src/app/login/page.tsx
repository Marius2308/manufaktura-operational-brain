"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("Wrong password.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="MANUFAKTURA" width={40} height={40} className="h-10 w-10 object-contain" priority unoptimized />
          <div>
            <h1 className="text-lg font-bold leading-tight">MANUFAKTURA</h1>
            <p className="text-xs text-zinc-400">Operational Brain</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-zinc-500">Internal tool — enter the team password.</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy || !password}
            className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
