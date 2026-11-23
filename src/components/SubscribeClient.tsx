"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

/** أزرار الدفع بالبطاقة لكل باقة: تبدأ الدفع وتحوّل لصفحة البوابة */
export function CardPayButtons({ t, plans, disabled }: { t: T; plans: PlanView[]; disabled?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function pay(planId: string) {
    setBusy(planId); setErr(null);
    const res = await fetch("/api/v1/payments/card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    if (res?.ok && j?.data?.redirectUrl) { window.location.assign(j.data.redirectUrl); return; }
    setBusy(null);
    setErr(t.card.errors[res?.status === 429 ? "RATE_LIMITED" : j?.error?.code] ?? t.errors[j?.error?.code] ?? t.card.errors.GENERIC);
  }
  return (
    <div className="space-y-2">
      {plans.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
          <span><span className="font-semibold">{p.name}</span> <span className="text-sm text-muted">· {p.durationDays} {t.days} · <span dir="ltr">{p.priceIqd.toLocaleString("en-US")} {t.iqd}</span></span></span>
          <button onClick={() => pay(p.id)} disabled={!!busy || disabled} className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:text-paper">{busy === p.id ? t.card.busy : t.card.pay}</button>
        </div>
      ))}
      {err && <p role="alert" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-danger">{err}</p>}
    </div>
  );
}

/** صفحة البوابة التجريبية: محاكاة نتيجة الدفع */
export function SandboxActions({ t, reference }: { t: T; reference: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go(outcome: "SUCCEEDED" | "FAILED") {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/v1/payments/sandbox/${encodeURIComponent(reference)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome }) }).catch(() => null);
    if (res?.ok) { router.push(`/subscribe/return?ref=${encodeURIComponent(reference)}`); return; }
    setBusy(false); setErr(t.card.errors.GENERIC);
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => go("SUCCEEDED")} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-60 dark:text-paper">{t.card.succeed}</button>
        <button disabled={busy} onClick={() => go("FAILED")} className="rounded-lg border border-line px-4 py-2 disabled:opacity-60">{t.card.fail}</button>
      </div>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </div>
  );
}

/** يحدّث صفحة العودة كل 3 ثوانٍ (حتى دقيقتين) ما دامت الدفعة بانتظار تأكيد البوابة */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => { if (++n > 40) clearInterval(id); router.refresh(); }, 3000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
