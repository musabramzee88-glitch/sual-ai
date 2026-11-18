"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type T = Dictionary["subscribe"];
export type PlanView = { id: string; name: string; durationDays: number; priceIqd: number };

export function CashRequestForm({ t, plans, disabled }: { t: T; plans: PlanView[]; disabled?: boolean }) {
  const router = useRouter();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const res = await fetch("/api/v1/subscription/cash-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, note: note || undefined }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) router.refresh(); else setErr(t.errors[j.error?.code] ?? t.errors.GENERIC);
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-2">
        {plans.map((p) => (
          <label key={p.id} className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 ${planId === p.id ? "border-brand bg-brand-soft" : "border-line"}`}>
            <span className="flex items-center gap-3"><input type="radio" name="plan" checked={planId === p.id} onChange={() => setPlanId(p.id)} /><span className="font-semibold">{p.name}</span><span className="text-sm text-muted">{p.durationDays} {t.days}</span></span>
            <span className="font-bold" dir="ltr">{p.priceIqd.toLocaleString("en-US")} {t.iqd}</span>
          </label>
        ))}
      </div>
      <label className="block text-sm"><span className="mb-1 block text-muted">{t.note}</span>
        <textarea className="w-full rounded-xl border border-line bg-paper px-3 py-2" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {err && <p role="alert" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-danger">{err}</p>}
      <button disabled={busy || disabled || !planId} className="w-full rounded-xl bg-brand px-5 py-2.5 font-semibold text-white disabled:opacity-60 dark:text-paper">{t.choose}</button>
    </form>
  );
}

export function CancelRequestButton({ t }: { t: T }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button className="rounded-lg border border-line px-4 py-2 text-sm" onClick={async () => {
        const res = await fetch("/api/v1/subscription/cash-request", { method: "DELETE" });
        const j = await res.json().catch(() => ({}));
        if (res.ok) router.refresh(); else setErr(t.errors[j.error?.code] ?? t.errors.GENERIC);
      }}>{t.cancel}</button>
      {err && <p role="alert" className="mt-1 text-sm text-danger">{err}</p>}
    </div>
  );
}
