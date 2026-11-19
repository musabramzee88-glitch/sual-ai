"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ActLabels } from "./AdminActions";

type Row = { name: string; state: "queued" | "uploading" | "done" | "error"; pct: number; msg?: string };
export type DropLabels = { dropTitle: string; dropHint: string; uploading: string; queued: string; uploaded: string; ocrToggle: string; ocrToggleHint: string };

/** منطقة رفع بالسحب والإفلات: يبدأ الرفع فور اختيار الملفات (بلا زر)، واحداً تلو الآخر مع نسبة التقدّم */
export function Dropzone({ t, L }: { t: DropLabels; L: ActLabels }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [ocr, setOcr] = useState(true);
  const input = useRef<HTMLInputElement>(null);

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
      fd.append("ocr", ocr ? "1" : "0");
      xhr.send(fd);
    });
  }
  async function start(list: File[]) {
    const files = list.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (files.length === 0 || busy) return;
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, state: "queued", pct: 0 })));
    for (let i = 0; i < files.length; i++) {
      setRows((r) => r.map((x, j) => (j === i ? { ...x, state: "uploading" } : x)));
      const res = await send(files[i], (p) => setRows((r) => r.map((x, j) => (j === i ? { ...x, pct: p } : x))));
      setRows((r) => r.map((x, j) => (j === i ? { ...x, state: res.ok ? "done" : "error", pct: 100, msg: res.ok ? undefined : L.errors[res.code ?? "GENERIC"] ?? L.errors.GENERIC } : x)));
      router.refresh();
    }
    setBusy(false);
  }
  return (
    <div className="space-y-3">
      <div
        role="button" tabIndex={0}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void start([...e.dataTransfer.files]); }}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition ${over ? "border-brand bg-brand-soft" : "border-line bg-surface"} ${busy ? "opacity-60" : ""}`}
      >
        <div className="text-lg font-semibold">{t.dropTitle}</div>
        <div className="mt-1 text-sm text-muted">{t.dropHint}</div>
        <input ref={input} type="file" accept="application/pdf,.pdf" multiple className="hidden" disabled={busy}
          onChange={(e) => { void start([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ocr} disabled={busy} onChange={(e) => setOcr(e.target.checked)} />{t.ocrToggle}</label>
      {!ocr && <p className="text-xs text-muted">{t.ocrToggleHint}</p>}
      {rows.length > 0 && (
        <ul className="space-y-1 text-sm">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate" dir="auto">{r.name}</span>
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

export type ReviewCard = {
  id: string; name: string; status: string; error: string | null; pageCount: number | null; processedPages: number;
  trackCode: string; gradeCode: string | null; subjectCode: string | null; kind: string; part: number;
  sure: boolean; linked: boolean; autoLinked: boolean; evidence: string | null; source: string | null; working: boolean;
};
export type ReviewLabels = {
  reviewTitle: string; reviewEmpty: string; reviewHint: string; confirm: string; confirmAll: string; sureTag: string; checkTag: string; autoTag: string; working: string; needsOcrTag: string; readOcr: string;
  fromCover: string; pickGrade: string; pickSubject: string; track: string; grade: string; subject: string; kind: string; remove: string; ocrPage: string; failedOcr: string;
  part: string; parts: string[]; partConflict: string;
};
type Sel = { track: string; grade: string; subject: string; kind: string; part: number };

/**
 * لوحة المراجعة: بطاقة لكل كتاب بصورة غلافه الفعلية ونتيجة التعرّف. الواثق منه يظهر محدّداً (وُضع تلقائياً)،
 * وتضغط ✓ للتأكيد أو تصحّح الاختيارات ثم ✓. التأكيد يضع الكتاب في منهجه (ينشئه إن لزم).
 */
export function ReviewBoard({ items, t, L, tracks, grades, subjects, kinds, occupied }: {
  items: ReviewCard[]; t: ReviewLabels; L: ActLabels; tracks: [string, string][]; grades: [string, string][]; subjects: [string, string][]; kinds: [string, string][]; occupied: string[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Record<string, Sel>>({});
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const get = (c: ReviewCard): Sel => sel[c.id] ?? { track: c.trackCode, grade: c.gradeCode ?? "", subject: c.subjectCode ?? "", kind: c.kind, part: c.part };
  const set = (c: ReviewCard, p: Partial<Sel>) => setSel((s) => ({ ...s, [c.id]: { ...get(c), ...p } }));
  const visible = items.filter((c) => !gone.has(c.id));
  const complete = (c: ReviewCard) => { const g = get(c); return !!(g.grade && g.subject) && !c.working; };
  // تعارض: نفس (مسار|صف|مادة|نوع|جزء) عند كتاب مؤكَّد آخر أو عند بطاقة أخرى معروضة (غالباً جزءان لكتاب واحد)
  const keyOf = (c: ReviewCard) => { const g = get(c); return `${g.track}|${g.grade}|${g.subject}|${g.kind}|${g.part}`; };
  const counts = new Map<string, number>();
  for (const c of visible) if (get(c).grade && get(c).subject) counts.set(keyOf(c), (counts.get(keyOf(c)) ?? 0) + 1);
  const conflict = (c: ReviewCard) => !!(get(c).grade && get(c).subject) && (occupied.includes(keyOf(c)) || (counts.get(keyOf(c)) ?? 0) > 1);
  const confirmable = visible.filter((c) => c.sure && complete(c) && !conflict(c));

  async function confirm(cards: ReviewCard[]) {
    setBusy(true);
    const res = await fetch("/api/v1/admin/books/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cards.map((c) => { const g = get(c); return { bookId: c.id, trackCode: g.track, gradeCode: g.grade, subjectCode: g.subject, kind: g.kind, part: g.part }; }) }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { const m = L.errors[j.error?.code] ?? L.errors.GENERIC; setErrs((e) => ({ ...e, ...Object.fromEntries(cards.map((c) => [c.id, m])) })); return; }
    const results = j.data.results as { bookId: string; ok: boolean; code?: string }[];
    setGone((g) => new Set([...g, ...results.filter((r) => r.ok).map((r) => r.bookId)]));
    setErrs((e) => ({ ...e, ...Object.fromEntries(results.filter((r) => !r.ok).map((r) => [r.bookId, L.errors[r.code ?? "GENERIC"] ?? L.errors.GENERIC])) }));
    router.refresh();
  }
  const sc = "w-full rounded-lg border border-line bg-paper px-2 py-1 text-xs";
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{t.reviewTitle} ({visible.length})</h2>
        {confirmable.length > 0 && (
          <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:text-paper" disabled={busy} onClick={() => confirm(confirmable)}>{t.confirmAll} ({confirmable.length})</button>
        )}
      </div>
      <p className="text-sm text-muted">{t.reviewHint}</p>
      {visible.length === 0 && <p className="rounded-xl border border-line bg-surface p-6 text-center text-muted">{t.reviewEmpty}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((c) => {
          const g = get(c);
          const needsOcr = c.status === "FAILED" && (c.error === "NEEDS_OCR" || c.error === "CANCELLED");
          return (
            <article key={c.id} className={`flex gap-3 rounded-xl border p-3 ${c.sure && complete(c) ? "border-brand/50" : "border-line"} bg-surface`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/v1/admin/books/${c.id}/cover`} alt="" loading="lazy" className="h-44 w-32 shrink-0 rounded-lg border border-line bg-line object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  {c.working ? <span className="text-muted">{t.working}{c.pageCount ? ` ${c.processedPages}/${c.pageCount}` : ""}</span>
                    : c.sure ? <span className="rounded-full bg-brand-soft px-2 py-0.5 text-brand">✓ {t.sureTag}</span>
                    : <span className="rounded-full bg-accent-soft px-2 py-0.5 text-danger">⚠ {t.checkTag}</span>}
                  {c.autoLinked && c.linked && <span className="text-muted">· {t.autoTag}</span>}
                  {needsOcr && <span className="text-danger">· {t.needsOcrTag}</span>}
                </div>
                <div className="truncate text-[11px] text-muted" dir="auto" title={c.name}>{c.name}</div>
                <select className={sc} value={g.grade} onChange={(e) => set(c, { grade: e.target.value })} aria-label={t.grade}><option value="">{t.pickGrade}</option>{grades.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <select className={sc} value={g.subject} onChange={(e) => set(c, { subject: e.target.value })} aria-label={t.subject}><option value="">{t.pickSubject}</option>{subjects.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <div className="flex gap-1.5">
                  <select className={sc} value={g.kind} onChange={(e) => set(c, { kind: e.target.value })} aria-label={t.kind}>{kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  <select className={sc} value={g.track} onChange={(e) => set(c, { track: e.target.value })} aria-label={t.track}>{tracks.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </div>
                <select className={sc} value={g.part} onChange={(e) => set(c, { part: Number(e.target.value) })} aria-label={t.part}>{t.parts.map((l, i) => <option key={i} value={i}>{l}</option>)}</select>
                {conflict(c) && <div role="status" className="rounded-lg bg-accent-soft px-2 py-1 text-[11px] text-danger">{t.partConflict}</div>}
                {c.evidence && <div className="line-clamp-2 text-[11px] text-muted" dir="auto">{c.source === "ocr" ? "OCR · " : ""}{t.fromCover}: «{c.evidence}»</div>}
                {errs[c.id] && <div role="alert" className="text-xs text-danger">{errs[c.id]}</div>}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-white disabled:opacity-40 dark:text-paper" disabled={busy || !complete(c)} onClick={() => confirm([c])}>{t.confirm}</button>
                  {needsOcr && <button className="rounded-lg border border-brand px-3 py-1 text-xs text-brand" onClick={async () => { await fetch(`/api/v1/admin/books/${c.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reprocess" }) }); router.refresh(); }}>{t.readOcr}</button>}
                  <button className="rounded-lg border border-line px-3 py-1 text-xs text-danger" onClick={async () => {
                    if (!window.confirm(L.confirm)) return;
                    const r = await fetch(`/api/v1/admin/books/${c.id}`, { method: "DELETE" });
                    if (r.ok) { setGone((x) => new Set([...x, c.id])); router.refresh(); }
                  }}>{t.remove}</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
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

/** يوقف كل معالجة جارية أو منتظرة */
export function CancelAll({ L, label }: { L: ActLabels; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="rounded-lg border border-danger px-4 py-2 text-sm font-semibold text-danger disabled:opacity-50" disabled={busy} onClick={async () => {
      if (!window.confirm(L.confirm)) return;
      setBusy(true);
      await fetch("/api/v1/admin/books/cancel-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setBusy(false);
      router.refresh();
    }}>{label}</button>
  );
}
