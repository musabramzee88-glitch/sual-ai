"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ActLabels } from "./AdminActions";

type Row = { name: string; state: "queued" | "uploading" | "done" | "error"; pct: number; msg?: string };
export type UploaderLabels = { choose: string; upload: string; uploading: string; queued: string; uploaded: string };

/** رفع ملفات متعددة واحداً تلو الآخر مع نسبة التقدّم (XHR لدعم تقدّم الرفع) */
export function BookUploader({ t, L }: { t: UploaderLabels; L: ActLabels }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  function send(f: File, onPct: (p: number) => void): Promise<{ ok: boolean; code?: string }> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/v1/admin/books");
      xhr.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => {
        let code: string | undefined;
        try { code = JSON.parse(xhr.responseText)?.error?.code; } catch { /* ignore */ }
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, code });
      };
      xhr.onerror = () => resolve({ ok: false, code: "GENERIC" });
      const fd = new FormData();
      fd.append("file", f);
      xhr.send(fd);
    });
  }
  async function start() {
    setBusy(true);
    const init: Row[] = files.map((f) => ({ name: f.name, state: "queued", pct: 0 }));
    setRows(init);
    for (let i = 0; i < files.length; i++) {
      setRows((r) => r.map((x, j) => (j === i ? { ...x, state: "uploading" } : x)));
      const res = await send(files[i], (p) => setRows((r) => r.map((x, j) => (j === i ? { ...x, pct: p } : x))));
      setRows((r) => r.map((x, j) => (j === i ? { ...x, state: res.ok ? "done" : "error", pct: 100, msg: res.ok ? undefined : L.errors[res.code ?? "GENERIC"] ?? L.errors.GENERIC } : x)));
      router.refresh();
    }
    setBusy(false);
    setFiles([]);
  }
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm">
          {t.choose}
          <input type="file" accept="application/pdf,.pdf" multiple className="hidden" disabled={busy} onChange={(e) => setFiles([...(e.target.files ?? [])])} />
        </label>
        <span className="text-sm text-muted">{files.length > 0 && `${files.length} × PDF`}</span>
        <button className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:text-paper" disabled={busy || files.length === 0} onClick={start}>{t.upload}</button>
      </div>
      {rows.length > 0 && (
        <ul className="space-y-1 text-sm">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="w-40">
                {r.state === "uploading" ? <span className="block h-2 overflow-hidden rounded bg-line"><span className="block h-2 bg-brand" style={{ width: `${r.pct}%` }} /></span>
                  : r.state === "done" ? <span className="text-brand">{t.uploaded}</span>
                  : r.state === "error" ? <span className="text-danger">{r.msg}</span> : <span className="text-muted">{t.queued}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** يحدّث الصفحة دورياً ما دامت هناك كتب قيد المعالجة */
export function AutoRefresh({ active, ms = 3000 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [active, ms, router]);
  return null;
}

/** اختيار المنهج المرتبط بالكتاب */
export function LinkSelect({ bookId, value, options, none, L }: { bookId: string; value: string | null; options: [string, string][]; none: string; L: ActLabels }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <select className="max-w-56 rounded-lg border border-line bg-paper px-2 py-1 text-xs" defaultValue={value ?? ""} onChange={async (e) => {
        setErr(null);
        const res = await fetch(`/api/v1/admin/books/${bookId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link", curriculumId: e.target.value || null }) });
        const j = await res.json().catch(() => ({}));
        if (res.ok) router.refresh(); else setErr(L.errors[j.error?.code] ?? L.errors.GENERIC);
      }}>
        <option value="">{none}</option>
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}

export type BulkLabels = { bulkTitle: string; bulkHint: string; bulkTrack: string; bulkApply: string; bulkNeed: string; pickGrade: string; pickSubject: string; bulkDone: string; created: string; linked: string; kind: string; name: string };
type Item = { id: string; name: string; grade: string; subject: string; kind: string; on: boolean; result?: string };

/** مراجعة اقتراحات الربط (صف/مادة/نوع من اسم الملف) ثم إنشاء المناهج وربط الكتب دفعة واحدة */
export function BulkLink({ t, L, tracks, grades, subjects, kinds, initial }: {
  t: BulkLabels; L: ActLabels; tracks: [string, string][]; grades: [string, string][]; subjects: [string, string][]; kinds: [string, string][];
  initial: { id: string; name: string; grade: string | null; subject: string | null; kind: string }[];
}) {
  const router = useRouter();
  const [track, setTrack] = useState(tracks.find(([k]) => k === "GENERAL")?.[0] ?? tracks[0]?.[0] ?? "");
  const [rows, setRows] = useState<Item[]>(() => initial.map((x) => ({ id: x.id, name: x.name, grade: x.grade ?? "", subject: x.subject ?? "", kind: x.kind, on: !!(x.grade && x.subject) })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (i: number, p: Partial<Item>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const sel = "rounded-lg border border-line bg-paper px-2 py-1 text-xs";
  const ready = rows.filter((r) => r.on && r.grade && r.subject);
  const incomplete = rows.some((r) => r.on && !(r.grade && r.subject));
  // كتب جديدة رُفعت بعد فتح الصفحة تُضاف للقائمة دون فقد ما عدّله المستخدم
  useEffect(() => {
    setRows((cur) => {
      const have = new Set(cur.map((x) => x.id));
      const add = initial.filter((x) => !have.has(x.id)).map((x) => ({ id: x.id, name: x.name, grade: x.grade ?? "", subject: x.subject ?? "", kind: x.kind, on: !!(x.grade && x.subject) }));
      return add.length ? [...cur, ...add] : cur;
    });
  }, [initial]);
  if (rows.length === 0) return null;

  async function apply() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/v1/admin/books/link", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackCode: track, items: ready.map((r) => ({ bookId: r.id, gradeCode: r.grade, subjectCode: r.subject, kind: r.kind })) }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(L.errors[j.error?.code] ?? L.errors.GENERIC);
    const by = new Map<string, { ok: boolean; created?: boolean; code?: string }>((j.data.results as { bookId: string; ok: boolean; created?: boolean; code?: string }[]).map((x) => [x.bookId, x]));
    setRows((r) => r.map((x) => {
      const o = by.get(x.id);
      return o ? { ...x, on: !o.ok, result: o.ok ? (o.created ? t.created : t.linked) : (L.errors[o.code ?? "GENERIC"] ?? L.errors.GENERIC) } : x;
    }));
    router.refresh();
  }
  return (
    <section className="mb-6 space-y-3 rounded-xl border border-brand/40 bg-surface p-4">
      <h2 className="font-semibold">{t.bulkTitle}</h2>
      <p className="text-sm text-muted">{t.bulkHint}</p>
      <label className="flex items-center gap-2 text-sm"><span className="text-muted">{t.bulkTrack}</span>
        <select className={sel} value={track} onChange={(e) => setTrack(e.target.value)}>{tracks.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-line/60">
                <td className="p-2"><input type="checkbox" checked={r.on} disabled={!!r.result && !r.on} onChange={(e) => set(i, { on: e.target.checked })} /></td>
                <td className="max-w-56 break-words p-2 text-xs" dir="auto">{!(r.grade && r.subject) && <span title={t.bulkNeed}>⚠ </span>}{r.name}</td>
                <td className="p-2"><select className={sel} value={r.grade} onChange={(e) => set(i, { grade: e.target.value, on: !!(e.target.value && r.subject) || r.on })}><option value="">{t.pickGrade}</option>{grades.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                <td className="p-2"><select className={sel} value={r.subject} onChange={(e) => set(i, { subject: e.target.value, on: !!(r.grade && e.target.value) || r.on })}><option value="">{t.pickSubject}</option>{subjects.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                <td className="p-2"><select className={sel} value={r.kind} onChange={(e) => set(i, { kind: e.target.value })}>{kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                <td className="p-2 text-xs">{r.result && <span className={r.on ? "text-danger" : "text-brand"}>{r.result}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:text-paper" disabled={busy || ready.length === 0 || incomplete} onClick={apply}>{t.bulkApply} ({ready.length})</button>
        {incomplete && <span className="text-xs text-danger">{t.bulkNeed}</span>}
        {err && <span role="alert" className="text-sm text-danger">{err}</span>}
      </div>
    </section>
  );
}

/** يعيد معالجة كل الكتب الفاشلة بـ NEEDS_OCR (تُعالَج بالتتابع في الخلفية) */
export function ReprocessFailed({ L, label, queued }: { L: ActLabels; label: string; queued: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <button className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand disabled:opacity-50" disabled={busy} onClick={async () => {
        setBusy(true); setMsg(null);
        const res = await fetch("/api/v1/admin/books/reprocess-failed", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const j = await res.json().catch(() => ({}));
        setBusy(false);
        setMsg(res.ok ? `${queued} ${j.data.queued}` : (L.errors[j.error?.code] ?? L.errors.GENERIC));
        router.refresh();
      }}>{label}</button>
      {msg && <span className="text-sm text-muted">{msg}</span>}
    </div>
  );
}
