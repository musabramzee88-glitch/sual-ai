"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExamDict } from "@/lib/i18n/exams";

export type WizardCurriculum = {
  id: string; title: string; kind: string; part: number; pageCount: number;
  grade: { code: string; name: string }; subject: { code: string; name: string; types: string[] };
  chapters: { id: string; title: string; pageStart: number | null; pageEnd: number | null }[];
};
type Row = { type: string; count: number; marksEach: number };
export type WizardStructure = { id: string; title: string; curriculumId: string; kind: string; difficulty: string; durationMinutes: number | null; totalMarks: number; createdAt: string; sections: { type: string; count: number }[] };

const sc = "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm";
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

export function ExamWizard({ options, structures, generatable, t }: { options: WizardCurriculum[]; structures: WizardStructure[]; generatable: string[]; t: ExamDict }) {
  const router = useRouter();
  const grades = useMemo(() => [...new Map(options.map((o) => [o.grade.code, o.grade.name])).entries()], [options]);
  const [grade, setGrade] = useState("");
  const subjects = useMemo(() => [...new Map(options.filter((o) => o.grade.code === grade).map((o) => [o.subject.code, o.subject.name])).entries()], [options, grade]);
  const [subject, setSubject] = useState("");
  const books = options.filter((o) => o.grade.code === grade && o.subject.code === subject);
  const [curId, setCurId] = useState("");
  const cur = options.find((o) => o.id === curId);
  const usableChapters = (cur?.chapters ?? []).filter((c) => c.pageStart != null && c.pageEnd != null);
  const [mode, setMode] = useState<"chapters" | "pages">("chapters");
  const effMode = usableChapters.length === 0 ? "pages" : mode;
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [pageFrom, setPageFrom] = useState(1);
  const [pageTo, setPageTo] = useState(10);
  const types = (cur?.subject.types.length ? cur.subject.types : generatable).filter((x) => generatable.includes(x));
  const [rows, setRows] = useState<Row[]>([{ type: "MCQ", count: 5, marksEach: 2 }]);
  const [difficulty, setDifficulty] = useState("MIXED");
  const [kind, setKind] = useState("MONTHLY");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("");
  const [marking, setMarking] = useState<"smart" | "equal" | "manual">("smart");
  const [total, setTotal] = useState(100);
  const manual = marking === "manual";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalQ = rows.reduce((n, r) => n + r.count, 0);
  const totalM = manual ? rows.reduce((n, r) => n + r.count * r.marksEach, 0) : total;
  const pickBook = (id: string) => {
    setCurId(id);
    const c = options.find((o) => o.id === id);
    setChapterIds([]);
    setPageFrom(1);
    setPageTo(Math.min(10, c?.pageCount ?? 10));
    const allowed = (c?.subject.types.length ? c.subject.types : generatable).filter((x) => generatable.includes(x));
    setRows((rs) => rs.map((r) => (allowed.includes(r.type) ? r : { ...r, type: allowed[0] ?? "MCQ" })));
  };
  /** يبدأ بهيكل امتحان سابق: الصف والمادة والكتاب والأنواع والأعداد والدرجة والنوع والصعوبة والمدة (لا الفصول ولا العنوان) */
  const applyStructure = (id: string) => {
    const st = structures.find((x) => x.id === id);
    if (!st) return;
    const c = options.find((o) => o.id === st.curriculumId);
    if (c) { setGrade(c.grade.code); setSubject(c.subject.code); pickBook(c.id); }
    const allowed = (c?.subject.types.length ? c.subject.types : generatable).filter((x) => generatable.includes(x));
    const next = st.sections.filter((s) => allowed.includes(s.type)).map((s) => ({ type: s.type, count: Math.min(20, s.count), marksEach: 2 }));
    if (next.length) setRows(next);
    setKind(st.kind); setDifficulty(st.difficulty); setDuration(st.durationMinutes ? String(st.durationMinutes) : ""); setMarking("smart"); setTotal(st.totalMarks);
    setTitle("");
  };
  const setRow = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const sourceOk = effMode === "chapters" ? chapterIds.length > 0 : pageFrom >= 1 && pageTo >= pageFrom && pageTo <= (cur?.pageCount ?? 0);
  const canGo = !!cur && sourceOk && rows.length > 0 && totalQ <= 40 && new Set(rows.map((r) => r.type)).size === rows.length && (manual || total >= Math.ceil(totalQ / 2)) && !busy;

  async function generate() {
    if (!cur) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/v1/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curriculumId: cur.id, kind, difficulty, sections: manual ? rows : rows.map((r) => ({ ...r, marksEach: 1 })),
          ...(manual ? {} : { totalMarks: total, distribution: marking }),
          ...(effMode === "chapters" ? { chapterIds } : { pageFrom, pageTo }),
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(Number(duration) >= 5 ? { durationMinutes: Number(duration) } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.data?.examId) { router.push(`/exams/${j.data.examId}`); return; }
      setErr(t.errors[j.error?.code] ?? t.errors.GENERIC);
    } catch {
      setErr(t.errors.GENERIC);
    }
    setBusy(false);
  }

  if (options.length === 0) return <p className="rounded-xl border border-line bg-surface p-6 text-center text-muted">{t.wizard.noOptions}</p>;

  return (
    <div className="space-y-6">
      {structures.length > 0 && (
        <label className="block space-y-1 rounded-xl border border-dashed border-line p-3 text-sm">
          <span className="font-semibold">{t.wizard.fromPrevious}</span>
          <select className={sc} defaultValue="" onChange={(e) => { if (e.target.value) applyStructure(e.target.value); }}>
            <option value="">{t.wizard.fromScratch}</option>
            {structures.map((x) => <option key={x.id} value={x.id}>{x.title} — {x.sections.reduce((n, s) => n + s.count, 0)} · {x.totalMarks}</option>)}
          </select>
          <span className="block text-xs text-muted">{t.wizard.fromPreviousHint}</span>
        </label>
      )}
      <section className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm"><span className="text-muted">{t.wizard.grade}</span>
          <select className={sc} value={grade} onChange={(e) => { setGrade(e.target.value); setSubject(""); setCurId(""); }}><option value="">{t.wizard.pick}</option>{grades.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
        </label>
        <label className="space-y-1 text-sm"><span className="text-muted">{t.wizard.subject}</span>
          <select className={sc} value={subject} disabled={!grade} onChange={(e) => { setSubject(e.target.value); setCurId(""); }}><option value="">{t.wizard.pick}</option>{subjects.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
        </label>
        <label className="space-y-1 text-sm"><span className="text-muted">{t.wizard.book}</span>
          <select className={sc} value={curId} disabled={!subject} onChange={(e) => pickBook(e.target.value)}><option value="">{t.wizard.pick}</option>{books.map((b) => <option key={b.id} value={b.id}>{t.bookKinds[b.kind] ?? b.kind}{b.part ? ` — ${b.part}` : ""}</option>)}</select>
        </label>
      </section>

      {cur && (
        <section className="space-y-3">
          <h2 className="font-semibold">{t.wizard.source}</h2>
          {usableChapters.length > 0 && (
            <div className="flex gap-2 text-sm">
              <button type="button" className={`rounded-lg border px-3 py-1 ${effMode === "chapters" ? "border-brand bg-brand-soft text-brand" : "border-line"}`} onClick={() => setMode("chapters")}>{t.wizard.chapters}</button>
              <button type="button" className={`rounded-lg border px-3 py-1 ${effMode === "pages" ? "border-brand bg-brand-soft text-brand" : "border-line"}`} onClick={() => setMode("pages")}>{t.wizard.byPages}</button>
            </div>
          )}
          {usableChapters.length === 0 && <p className="text-sm text-muted">{t.wizard.noChapters}</p>}
          {effMode === "chapters" ? (
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
              {usableChapters.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-paper">
                  <input type="checkbox" checked={chapterIds.includes(c.id)} onChange={(e) => setChapterIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id)))} />
                  <span className="flex-1" dir="auto">{c.title}</span>
                  <span className="shrink-0 text-xs text-muted" dir="ltr">{c.pageStart}–{c.pageEnd}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label className="space-y-1"><span className="text-muted">{t.wizard.from}</span><input type="number" min={1} max={cur.pageCount} className={`${sc} w-28`} value={pageFrom} onChange={(e) => setPageFrom(Number(e.target.value))} /></label>
              <label className="space-y-1"><span className="text-muted">{t.wizard.to}</span><input type="number" min={1} max={cur.pageCount} className={`${sc} w-28`} value={pageTo} onChange={(e) => setPageTo(Number(e.target.value))} /></label>
              <span className="pb-2 text-muted">{cur.pageCount} {t.wizard.pagesOf}</span>
            </div>
          )}
        </section>
      )}

      {cur && (
        <section className="space-y-3">
          <h2 className="font-semibold">{t.wizard.sections}</h2>
          {rows.map((r, i) => (
            <div key={i} className={`grid ${manual ? "grid-cols-[1fr_5rem_5rem_auto]" : "grid-cols-[1fr_5rem_auto]"} items-end gap-2 text-sm`}>
              <label className="space-y-1"><span className="text-muted">{t.wizard.type}</span>
                <select className={sc} value={r.type} onChange={(e) => setRow(i, { type: e.target.value })}>{types.map((x) => <option key={x} value={x}>{t.qt[x] ?? x}</option>)}</select>
              </label>
              <label className="space-y-1"><span className="text-muted">{t.wizard.count}</span><input type="number" min={1} max={20} className={sc} value={r.count} onChange={(e) => setRow(i, { count: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></label>
              {manual && <label className="space-y-1"><span className="text-muted">{t.wizard.marksEach}</span><input type="number" min={1} max={50} className={sc} value={r.marksEach} onChange={(e) => setRow(i, { marksEach: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} /></label>}
              <button type="button" className="rounded-lg border border-line px-3 py-2 text-danger disabled:opacity-40" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>{t.wizard.remove}</button>
            </div>
          ))}
          <button type="button" className="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-40" disabled={rows.length >= Math.min(8, types.length)} onClick={() => setRows((rs) => [...rs, { type: types.find((x) => !rs.some((r) => r.type === x)) ?? types[0], count: 3, marksEach: 2 }])}>{t.wizard.addSection}</button>
          <div className="grid gap-2 rounded-lg border border-line p-3 text-sm sm:grid-cols-[1fr_8rem]">
            <fieldset className="space-y-1">
              <legend className="mb-1 font-semibold">{t.wizard.marking}</legend>
              {(["smart", "equal", "manual"] as const).map((m) => (
                <label key={m} className="flex items-center gap-2"><input type="radio" name="marking" checked={marking === m} onChange={() => setMarking(m)} />{m === "smart" ? t.wizard.markSmart : m === "equal" ? t.wizard.markEqual : t.wizard.markManual}</label>
              ))}
            </fieldset>
            {!manual && <label className="space-y-1"><span className="text-muted">{t.wizard.totalMarks}</span><input type="number" min={5} max={1000} className={sc} value={total} onChange={(e) => setTotal(Math.max(5, Math.min(1000, Number(e.target.value) || 5)))} /></label>}
          </div>
          <p className={`text-sm ${totalQ > 40 ? "text-danger" : "text-muted"}`}>{fill(t.wizard.summary, { q: totalQ, m: totalM })}</p>
        </section>
      )}

      {cur && (
        <section className="grid gap-3 text-sm sm:grid-cols-2">
          <label className="space-y-1"><span className="text-muted">{t.wizard.difficulty}</span><select className={sc} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>{Object.entries(t.difficulties).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="space-y-1"><span className="text-muted">{t.wizard.kind}</span><select className={sc} value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(t.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="space-y-1"><span className="text-muted">{t.wizard.examTitle}</span><input className={sc} maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="space-y-1"><span className="text-muted">{t.wizard.duration}</span><input type="number" min={5} max={300} className={sc} value={duration} onChange={(e) => setDuration(e.target.value)} /></label>
        </section>
      )}

      {cur && (
        <div className="space-y-2">
          <p className="text-xs text-muted">{t.wizard.reviewNote}</p>
          {err && <p role="alert" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-danger">{err}</p>}
          {busy && <p role="status" className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">{t.wizard.generating}</p>}
          <button type="button" className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-white disabled:opacity-50 dark:text-paper" disabled={!canGo} onClick={generate}>{t.wizard.generate}</button>
        </div>
      )}
    </div>
  );
}
