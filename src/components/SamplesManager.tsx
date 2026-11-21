"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type SampleLabels = {
  upload: string; file: string; subject: string; grade: string; allGrades: string; name: string; uploading: string; empty: string; chars: string;
  active: string; inactive: string; edit: string; save: string; saved: string; enable: string; disable: string; del: string; confirmDel: string;
  errors: Record<string, string>; generic: string;
};
export type SampleRow = { id: string; title: string; subject: string; grade: string | null; text: string; isActive: boolean; fileName: string | null };

const inp = "rounded-lg border border-line bg-paper px-3 py-2 text-sm";

export function SampleUpload({ subjects, grades, t }: { subjects: [string, string][]; grades: [string, string][]; t: SampleLabels }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/v1/admin/samples", { method: "POST", body: new FormData(form) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(t.errors[j.error?.code] ?? t.generic); return; }
    form.reset();
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-line bg-surface p-4 text-sm sm:grid-cols-2">
      <label className="space-y-1"><span className="text-muted">{t.subject}</span><select name="subjectCode" required className={`${inp} w-full`}>{subjects.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
      <label className="space-y-1"><span className="text-muted">{t.grade}</span><select name="gradeCode" className={`${inp} w-full`}><option value="">{t.allGrades}</option>{grades.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
      <label className="space-y-1 sm:col-span-2"><span className="text-muted">{t.name}</span><input name="title" required maxLength={150} className={`${inp} w-full`} /></label>
      <label className="space-y-1 sm:col-span-2"><span className="text-muted">{t.file}</span><input name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm" /></label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={busy} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50 dark:text-paper">{t.upload}</button>
        {busy && <span role="status" className="text-brand">{t.uploading}</span>}
        {err && <span role="alert" className="text-danger">{err}</span>}
      </div>
    </form>
  );
}

export function SampleCard({ s, t }: { s: SampleRow; t: SampleLabels }) {
  const router = useRouter();
  const [text, setText] = useState(s.text);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function call(method: string, body?: unknown) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/v1/admin/samples/${s.id}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    if (!res.ok) { setMsg(t.generic); return false; }
    router.refresh();
    return true;
  }
  return (
    <article className="space-y-2 rounded-xl border border-line bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold" dir="auto">{s.title}</h3>
        <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">{s.subject}{s.grade ? ` · ${s.grade}` : ""}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${s.isActive ? "bg-brand-soft text-brand" : "bg-accent-soft text-danger"}`}>{s.isActive ? t.active : t.inactive}</span>
        <span className="text-xs text-muted">{s.text.length} {t.chars}</span>
        <span className="flex-1" />
        <button className="rounded-lg border border-line px-2.5 py-1 text-xs" disabled={busy} onClick={() => call("PATCH", { isActive: !s.isActive })}>{s.isActive ? t.disable : t.enable}</button>
        <button className="rounded-lg border border-line px-2.5 py-1 text-xs text-danger" disabled={busy} onClick={() => { if (window.confirm(t.confirmDel)) call("DELETE"); }}>{t.del}</button>
      </div>
      <details>
        <summary className="cursor-pointer text-muted">{t.edit}</summary>
        <textarea className={`${inp} mt-2 w-full leading-7`} rows={14} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2 flex items-center gap-2">
          <button className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white disabled:opacity-50 dark:text-paper" disabled={busy || text.trim().length < 30 || text === s.text} onClick={async () => { if (await call("PATCH", { text })) setMsg(t.saved); }}>{t.save}</button>
          {msg && <span className="text-xs">{msg}</span>}
        </div>
      </details>
    </article>
  );
}
