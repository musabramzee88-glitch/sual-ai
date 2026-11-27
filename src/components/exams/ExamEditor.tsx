"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ExamDict } from "@/lib/i18n/exams";
import { MathText } from "./MathText";
import { VERBATIM_TYPES, type QType } from "@/lib/question-types";

export type EditorTable = { header: boolean; cells: string[][]; style?: "GRID" | "PLAIN" | "BLANKS" };
const STYLES = ["GRID", "PLAIN", "BLANKS"] as const;
export type EditorQuestion = { id: string; prompt: string; options: string[] | null; answer: string; marks: number; sourcePages: number[]; version: number; imageAssetId: string | null; table: EditorTable | null };
export type EditorSection = { id: string; type: string; instruction: string; marks: number; answerCount: number | null; passage?: string | null; branches: EditorQuestion[] };

const LETTERS_AR = ["أ", "ب", "ج", "د", "هـ", "و"];
const LETTERS_EN = ["a", "b", "c", "d", "e", "f"];
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const inp = "rounded-lg border border-line bg-surface px-2 py-1.5 text-sm";
const btn = "rounded-lg border border-line px-2.5 py-1 text-xs disabled:opacity-40";

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, code: j.error?.code as string | undefined, detail: j.error?.detail as string | undefined };
}

async function upload(url: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(url, { method: "POST", body: fd }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  return { ok: !!res?.ok, code: j?.error?.code as string | undefined, detail: undefined as string | undefined };
}

/** محرر جدول السؤال: عدد الصفوف والأعمدة وخلاياه (الفارغة يملؤها الطالب) */
function TableEditor({ initial, t, onSave, onCancel, busy }: { initial: EditorTable | null; t: ExamDict; onSave: (t: EditorTable) => void; onCancel: () => void; busy: boolean }) {
  const [header, setHeader] = useState(initial?.header ?? true);
  const [style, setStyle] = useState<(typeof STYLES)[number]>(initial?.style ?? "GRID");
  const [cells, setCells] = useState<string[][]>(initial?.cells ?? [["", "", ""], ["", "", ""], ["", "", ""]]);
  const rows = cells.length, cols = cells[0].length;
  const resize = (r: number, c: number) => setCells(Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => cells[i]?.[j] ?? "")));
  const num = "w-16 " + inp;
  return (
    <div className="space-y-2 rounded-lg border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5">{t.editor.media.rows}<input type="number" min={1} max={12} className={num} value={rows} onChange={(e) => resize(Math.min(12, Math.max(1, Number(e.target.value) || 1)), cols)} /></label>
        <label className="flex items-center gap-1.5">{t.editor.media.cols}<input type="number" min={1} max={8} className={num} value={cols} onChange={(e) => resize(rows, Math.min(8, Math.max(1, Number(e.target.value) || 1)))} /></label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />{t.editor.media.headerRow}</label>
      </div>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">{t.editor.media.tableStyle}</legend>
        <span>{t.editor.media.tableStyle}:</span>
        {STYLES.map((k) => (
          <label key={k} className={`cursor-pointer rounded-full border px-3 py-1 ${style === k ? "border-brand bg-brand-soft font-semibold text-brand" : "border-line"}`}>
            <input type="radio" name="tstyle" className="sr-only" checked={style === k} onChange={() => setStyle(k)} />{t.editor.media.tableStyles[k]}
          </label>
        ))}
      </fieldset>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <tbody>
            {cells.map((r, i) => (
              <tr key={i}>{r.map((c, j) => (
                <td key={j} className="p-0.5"><input dir="auto" maxLength={120} aria-label={`${i + 1}/${j + 1}`} className={`${inp} w-28 ${header && i === 0 ? "font-semibold" : ""}`} value={c} onChange={(e) => setCells(cells.map((row, a) => (a === i ? row.map((x, b) => (b === j ? e.target.value : x)) : row)))} /></td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white disabled:opacity-50 dark:text-paper" disabled={busy} onClick={() => onSave({ header, cells, ...(style === "GRID" ? {} : { style }) })}>{t.editor.media.saveTable}</button>
        <button className="rounded-lg border border-line px-3 py-1.5" onClick={onCancel}>{t.editor.cancel}</button>
      </div>
    </div>
  );
}

/** حالة مشتركة لكل زر: انشغال ورسالة خطأ، ثم تحديث الصفحة عند النجاح */
function useAction(t: ExamDict) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (p: Promise<{ ok: boolean; code?: string; detail?: string }>) => {
    setBusy(true);
    setErr(null);
    const r = await p;
    setBusy(false);
    if (!r.ok) {
      setErr(r.code === "TOTAL_TOO_SMALL" && r.detail ? fill(t.editor.tooSmall, { n: r.detail }) : t.errors[r.code ?? "GENERIC"] ?? t.errors.GENERIC);
      return false;
    }
    router.refresh();
    return true;
  };
  return { busy, err, run };
}

function Question({ q, n, type, lang, t, showAnswer, first, last, onMove }: { q: EditorQuestion; n: number; type: string; lang: "AR" | "EN"; t: ExamDict; showAnswer: boolean; first: boolean; last: boolean; onMove: (dir: -1 | 1) => void }) {
  const { busy, err, run } = useAction(t);
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(q.prompt);
  const [options, setOptions] = useState((q.options ?? []).join("\n"));
  const [answer, setAnswer] = useState(q.answer);
  const [marks, setMarks] = useState(q.marks);
  const [tableOpen, setTableOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const letters = lang === "EN" ? LETTERS_EN : LETTERS_AR;
  const num = (x: number) => (lang === "EN" ? String(x) : x.toLocaleString("ar-EG"));
  const save = async () => {
    const opts = type === "MCQ" ? options.split("\n").map((s) => s.trim()).filter(Boolean) : undefined;
    if (await run(call(`/api/v1/exams/questions/${q.id}`, "PATCH", { prompt, answer, marks, ...(opts ? { options: opts } : {}) }))) setEditing(false);
  };

  return (
    <li className="space-y-2 rounded-lg border border-line bg-paper p-3">
      {!editing ? (
        <>
          <div className="flex items-start gap-2">
            <span className="shrink-0 font-semibold">{lang === "EN" ? `${n}.` : `${num(n)}-`}</span>
            <MathText text={q.prompt} className="flex-1" />
            <span className="shrink-0 text-xs text-muted">({num(q.marks)} {t.marksShort})</span>
          </div>
          {q.options && (
            <ol className="flex flex-wrap gap-x-6 gap-y-1 ps-6 text-sm">
              {q.options.map((o, i) => <li key={i}><span className="font-semibold">{letters[i]}-</span> <MathText text={o} /></li>)}
            </ol>
          )}
          {(q.imageAssetId || q.table) && (
            <div className="space-y-2 ps-6">
              {q.imageAssetId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/v1/exams/questions/${q.id}/image?v=${q.imageAssetId}`} alt="" className="max-h-40 max-w-full rounded border border-line bg-white object-contain" />
              )}
              {q.table && (
                <table className="border-collapse text-sm">
                  <tbody>{q.table.cells.map((r, i) => <tr key={i}>{r.map((c, j) => {
                    const grid = !q.table!.style || q.table!.style === "GRID";
                    const blank = q.table!.style === "BLANKS" && j === r.length - 1 && c.trim() && !(q.table!.header && i === 0);
                    const cls = grid ? "border border-line px-2 py-1" : `px-2 py-0.5 text-start ${q.table!.header && i === 0 ? "border-b border-line" : ""}`;
                    return q.table!.header && i === 0 ? <th key={j} className={`${cls} ${grid ? "bg-surface" : ""}`}>{c}</th> : <td key={j} className={`min-w-16 ${cls}`}>{blank ? `(\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0) ${c}` : c || "\u00A0"}</td>;
                  })}</tr>)}</tbody>
                </table>
              )}
            </div>
          )}
          {tableOpen && <TableEditor initial={q.table} t={t} busy={busy} onCancel={() => setTableOpen(false)} onSave={async (tb) => { if (await run(call(`/api/v1/exams/questions/${q.id}/table`, "PUT", { table: tb }))) setTableOpen(false); }} />}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await run(upload(`/api/v1/exams/questions/${q.id}/image`, f)); }} />
          {VERBATIM_TYPES.includes(type as QType) && <p className="rounded bg-accent-soft px-2 py-0.5 text-xs">⚠ {t.editor.verbatim}</p>}
          {showAnswer && <p className="rounded bg-brand-soft px-2 py-1 text-sm"><span className="font-semibold">{t.editor.answer}: </span><MathText text={q.answer} /></p>}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {q.sourcePages.map((p) => <span key={p} className="rounded-full border border-line px-2 py-0.5 text-muted">{t.editor.page} {p}</span>)}
            <span className="flex-1" />
            <button className={btn} disabled={first} title={t.editor.moveUp} onClick={() => onMove(-1)}>{t.editor.up}</button>
            <button className={btn} disabled={last} title={t.editor.moveDown} onClick={() => onMove(1)}>{t.editor.down}</button>
            <button className={btn} disabled={busy} onClick={() => setEditing(true)}>{t.editor.edit}</button>
            <button className={btn} disabled={busy} title={t.editor.media.imgHint} onClick={() => fileRef.current?.click()}>{q.imageAssetId ? t.editor.media.changeImage : t.editor.media.addImage}</button>
            {q.imageAssetId && <button className={`${btn} text-danger`} disabled={busy} onClick={() => run(call(`/api/v1/exams/questions/${q.id}/image`, "DELETE"))}>{t.editor.media.removeImage}</button>}
            <button className={btn} disabled={busy} onClick={() => setTableOpen(true)}>{q.table ? t.editor.media.editTable : t.editor.media.addTable}</button>
            {q.table && <button className={`${btn} text-danger`} disabled={busy} onClick={() => run(call(`/api/v1/exams/questions/${q.id}/table`, "PUT", { table: null }))}>{t.editor.media.removeTable}</button>}

            <button className={btn} disabled={busy} onClick={() => run(call(`/api/v1/exams/questions/${q.id}`, "POST", { action: "duplicate" }))}>{t.editor.duplicate}</button>
            <button className={btn} disabled={busy} onClick={() => run(call(`/api/v1/exams/questions/${q.id}`, "POST", { action: "regenerate" }))}>{busy ? t.editor.busy : t.editor.regenerate}</button>
            {q.version > 1 && <button className={btn} disabled={busy} onClick={() => run(call(`/api/v1/exams/questions/${q.id}`, "POST", { action: "undo" }))}>{t.editor.undo}</button>}
            <button className={`${btn} text-danger`} disabled={busy} onClick={() => { if (window.confirm(t.editor.confirmDel)) run(call(`/api/v1/exams/questions/${q.id}`, "DELETE")); }}>{t.editor.del}</button>
          </div>
        </>
      ) : (
        <div className="space-y-2 text-sm">
          <label className="block space-y-1"><span className="text-muted">{t.editor.prompt}</span><textarea className={`${inp} w-full`} rows={3} dir="auto" value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
          {type === "MCQ" && <label className="block space-y-1"><span className="text-muted">{t.editor.options}</span><textarea className={`${inp} w-full`} rows={4} dir="auto" value={options} onChange={(e) => setOptions(e.target.value)} /></label>}
          <label className="block space-y-1"><span className="text-muted">{t.editor.answer}</span><textarea className={`${inp} w-full`} rows={2} dir="auto" value={answer} onChange={(e) => setAnswer(e.target.value)} /></label>
          <label className="block w-32 space-y-1"><span className="text-muted">{t.marks}</span><input type="number" min={0} max={100} step={0.5} className={`${inp} w-full`} value={marks} onChange={(e) => setMarks(Number(e.target.value))} /></label>
          <div className="flex gap-2">
            <button className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white disabled:opacity-50 dark:text-paper" disabled={busy || !prompt.trim() || !answer.trim()} onClick={save}>{t.editor.save}</button>
            <button className="rounded-lg border border-line px-3 py-1.5" onClick={() => { setEditing(false); setPrompt(q.prompt); setOptions((q.options ?? []).join("\n")); setAnswer(q.answer); setMarks(q.marks); }}>{t.editor.cancel}</button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </li>
  );
}

function ManualForm({ sectionId, type, t, onDone }: { sectionId: string; type: string; t: ExamDict; onDone: () => void }) {
  const { busy, err, run } = useAction(t);
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState("");
  const [answer, setAnswer] = useState("");
  const [marks, setMarks] = useState<number | "">("");
  const add = async () => {
    const opts = type === "MCQ" ? options.split("\n").map((s) => s.trim()).filter(Boolean) : undefined;
    if (await run(call(`/api/v1/exams/sections/${sectionId}`, "POST", { action: "addManual", prompt, answer, ...(opts ? { options: opts } : {}), ...(marks !== "" ? { marks } : {}) }))) onDone();
  };
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-line p-3 text-sm">
      <textarea className={`${inp} w-full`} rows={2} dir="auto" placeholder={t.editor.prompt} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      {type === "MCQ" && <textarea className={`${inp} w-full`} rows={4} dir="auto" placeholder={t.editor.options} value={options} onChange={(e) => setOptions(e.target.value)} />}
      <textarea className={`${inp} w-full`} rows={2} dir="auto" placeholder={t.editor.answer} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <div className="flex items-center gap-2">
        <input type="number" min={0.5} step={0.5} className={`${inp} w-24`} placeholder={t.marks} value={marks} onChange={(e) => setMarks(e.target.value === "" ? "" : Number(e.target.value))} />
        <button className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white disabled:opacity-50 dark:text-paper" disabled={busy || !prompt.trim() || !answer.trim()} onClick={add}>{t.editor.add}</button>
        <button className="rounded-lg border border-line px-3 py-1.5" onClick={onDone}>{t.editor.cancel}</button>
      </div>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </div>
  );
}

function Section({ s, i, count, lang, t, showAnswers, onMove }: { s: EditorSection; i: number; count: number; lang: "AR" | "EN"; t: ExamDict; showAnswers: boolean; onMove: (dir: -1 | 1) => void }) {
  const { busy, err, run } = useAction(t);
  const [editInst, setEditInst] = useState(false);
  const [inst, setInst] = useState(s.instruction);
  const [marks, setMarks] = useState(s.marks);
  const [manual, setManual] = useState(false);
  const [editPassage, setEditPassage] = useState(false);
  const [passage, setPassage] = useState(s.passage ?? "");
  const num = (x: number) => (lang === "EN" ? String(x) : x.toLocaleString("ar-EG"));
  const moveItem = (j: number, dir: -1 | 1) => {
    const ids = s.branches.map((b) => b.id);
    [ids[j], ids[j + dir]] = [ids[j + dir], ids[j]];
    run(call(`/api/v1/exams/sections/${s.id}`, "POST", { action: "reorder", ids }));
  };
  return (
    <section className="space-y-2 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-start gap-2">
        <span className="pt-1 font-bold">{lang === "EN" ? `Q${i + 1}/` : `س${num(i + 1)}/`}</span>
        {editInst ? (
          <div className="flex flex-1 gap-2">
            <input className={`${inp} flex-1`} dir="auto" value={inst} onChange={(e) => setInst(e.target.value)} />
            <button className="rounded-lg bg-brand px-3 text-sm font-semibold text-white dark:text-paper" disabled={busy || !inst.trim()} onClick={async () => { if (await run(call(`/api/v1/exams/sections/${s.id}`, "PATCH", { instruction: inst }))) setEditInst(false); }}>{t.editor.save}</button>
            <button className="rounded-lg border border-line px-3 text-sm" onClick={() => { setEditInst(false); setInst(s.instruction); }}>{t.editor.cancel}</button>
          </div>
        ) : (
          <button className="flex-1 text-start font-bold hover:underline" title={t.editor.editInstruction} onClick={() => setEditInst(true)}><MathText text={s.instruction} /></button>
        )}
        <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">{t.qt[s.type] ?? s.type}</span>
      </div>
      {s.type === "UNSEEN_PASSAGE" && s.passage != null && (
        editPassage ? (
          <div className="space-y-2">
            <textarea className={`${inp} w-full`} dir="auto" rows={10} value={passage} onChange={(e) => setPassage(e.target.value)} />
            <div className="flex gap-2">
              <button className="rounded-lg bg-brand px-3 py-1 text-sm font-semibold text-white dark:text-paper" disabled={busy || passage.trim().length < 40} onClick={async () => { if (await run(call(`/api/v1/exams/sections/${s.id}`, "PATCH", { passage }))) setEditPassage(false); }}>{t.editor.save}</button>
              <button className="rounded-lg border border-line px-3 text-sm" onClick={() => { setEditPassage(false); setPassage(s.passage ?? ""); }}>{t.editor.cancel}</button>
            </div>
          </div>
        ) : (
          <button className="block w-full whitespace-pre-line rounded-lg border border-line bg-paper p-3 text-start text-sm leading-7 hover:border-brand" dir="auto" title={t.editor.editPassage} onClick={() => setEditPassage(true)}>{s.passage}</button>
        )
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <label className="flex items-center gap-1">{t.editor.sectionMarks}
          <input type="number" min={0.5} step={0.5} className={`${inp} w-20`} value={marks} onChange={(e) => setMarks(Number(e.target.value))} />
        </label>
        <button className={btn} disabled={busy || marks === s.marks || marks <= 0} onClick={() => run(call(`/api/v1/exams/sections/${s.id}`, "PATCH", { marks }))}>{t.editor.apply}</button>
        {s.branches.length > 1 && (
          <label className="flex items-center gap-1">{t.editor.optional.branches}
            <select className={`${inp} w-auto`} disabled={busy} value={s.answerCount ?? 0} onChange={(e) => run(call(`/api/v1/exams/sections/${s.id}`, "PATCH", { answerCount: Number(e.target.value) || null }))}>
              <option value={0}>{t.editor.optional.allBranches}</option>
              {Array.from({ length: s.branches.length - 1 }, (_, k) => k + 1).map((k) => <option key={k} value={k}>{num(k)} {fill(t.editor.optional.ofBranches, { n: num(s.branches.length) })}</option>)}
            </select>
          </label>
        )}
        <span className="flex-1" />
        <button className={btn} disabled={i === 0 || busy} title={t.editor.moveUp} onClick={() => onMove(-1)}>{t.editor.up}</button>
        <button className={btn} disabled={i === count - 1 || busy} title={t.editor.moveDown} onClick={() => onMove(1)}>{t.editor.down}</button>
        <button className={btn} disabled={busy} onClick={() => run(call(`/api/v1/exams/sections/${s.id}`, "POST", { action: "duplicate" }))}>{t.editor.duplicateSection}</button>
        <button className={`${btn} text-danger`} disabled={busy} onClick={() => { if (window.confirm(t.editor.confirmDeleteSection)) run(call(`/api/v1/exams/sections/${s.id}`, "DELETE")); }}>{t.editor.deleteSection}</button>
      </div>
      <ol className="space-y-2">
        {s.branches.map((q, j) => <Question key={`${q.id}:${q.version}:${q.marks}:${q.imageAssetId}:${JSON.stringify(q.table)}`} q={q} n={j + 1} type={s.type} lang={lang} t={t} showAnswer={showAnswers} first={j === 0} last={j === s.branches.length - 1} onMove={(d) => moveItem(j, d)} />)}
      </ol>
      {manual ? <ManualForm sectionId={s.id} type={s.type} t={t} onDone={() => setManual(false)} /> : (
        <div className="flex flex-wrap gap-2">
          <button className={btn} onClick={() => setManual(true)}>{t.editor.addManual}</button>
          {s.type !== "DIAGRAM" && <button className={btn} disabled={busy} onClick={() => run(call(`/api/v1/exams/sections/${s.id}`, "POST", { action: "generateMore", count: 1 }))}>{busy ? t.editor.busy : t.editor.addAi}</button>}
        </div>
      )}
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </section>
  );
}

export function ExamEditor({ examId, title, duration, totalMarks, sectionsToAnswer, firstRequired, sections, lang, types, t }: {
  examId: string; title: string; duration: number | null; totalMarks: number; sectionsToAnswer: number | null; firstRequired: boolean; sections: EditorSection[]; lang: "AR" | "EN"; types: string[]; t: ExamDict;
}) {
  const router = useRouter();
  const meta = useAction(t), marks = useAction(t), add = useAction(t), order = useAction(t), pick = useAction(t);
  const [toAnswer, setToAnswer] = useState(sectionsToAnswer ?? 0);
  const [first, setFirst] = useState(firstRequired);
  const [showAnswers, setShowAnswers] = useState(true);
  const [name, setName] = useState(title);
  const [dur, setDur] = useState(duration ? String(duration) : "");
  const [total, setTotal] = useState(totalMarks);
  const [mode, setMode] = useState<"smart" | "equal">("smart");
  const free = types.filter((x) => !sections.some((s) => s.type === x));
  const [newType, setNewType] = useState(free[0] ?? "");
  const [newCount, setNewCount] = useState(3);
  const [newMarks, setNewMarks] = useState(2);
  const moveSection = (i: number, dir: -1 | 1) => {
    const ids = sections.map((s) => s.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    order.run(call(`/api/v1/exams/${examId}`, "POST", { action: "reorderSections", ids }));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/exams/${examId}/print`} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white dark:text-paper">{t.editor.print}</Link>
        <Link href={`/exams/${examId}/print?v=key`} className="rounded-lg border border-line px-4 py-2">{t.editor.printKey}</Link>
        <label className="flex items-center gap-1.5 px-2"><input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} />{t.editor.showAnswers}</label>
        <span className="flex-1" />
        <button className="rounded-lg border border-line px-3 py-2 text-danger" onClick={async () => { if (window.confirm(t.editor.confirmDeleteExam) && (await call(`/api/v1/exams/${examId}`, "DELETE")).ok) router.push("/exams"); }}>{t.editor.deleteExam}</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
        <span className="rounded-full border border-line px-3 py-1">{t.editor.status.questions}: {sections.reduce((n, x) => n + x.branches.length, 0)}</span>
        <span className="rounded-full border border-line px-3 py-1">{t.total}: {totalMarks}</span>
        {total > 0 && (
          <span className={`rounded-full px-3 py-1 font-semibold ${totalMarks === total ? "bg-brand-soft text-brand" : totalMarks < total ? "bg-accent-soft text-ink" : "bg-accent-soft text-danger"}`}>
            {totalMarks === total ? t.editor.status.reached : totalMarks < total ? fill(t.editor.status.remaining, { n: total - totalMarks, t: total }) : fill(t.editor.status.over, { n: totalMarks - total, t: total })}
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-line p-3 text-sm">
          <h2 className="font-semibold">{t.editor.settings}</h2>
          <div className="flex flex-wrap gap-2">
            <input className={`${inp} min-w-0 flex-1`} dir="auto" value={name} placeholder={t.editor.examTitle} onChange={(e) => setName(e.target.value)} />
            <input type="number" min={5} max={300} className={`${inp} w-24`} value={dur} placeholder={t.editor.duration} onChange={(e) => setDur(e.target.value)} />
            <button className="rounded-lg bg-brand px-3 font-semibold text-white disabled:opacity-50 dark:text-paper" disabled={meta.busy || !name.trim()} onClick={() => meta.run(call(`/api/v1/exams/${examId}`, "POST", { action: "meta", title: name.trim(), durationMinutes: Number(dur) >= 5 ? Number(dur) : null }))}>{t.editor.saveMeta}</button>
          </div>
          {meta.err && <p role="alert" className="text-xs text-danger">{meta.err}</p>}
        </div>
        <div className="space-y-2 rounded-xl border border-line p-3 text-sm">
          <h2 className="font-semibold">{t.editor.marksTitle} <span className="font-normal text-muted">({t.total}: {totalMarks})</span></h2>
          <div className="flex flex-wrap gap-2">
            <input type="number" min={1} max={1000} className={`${inp} w-24`} value={total} onChange={(e) => setTotal(Number(e.target.value))} aria-label={t.editor.total} />
            <select className={`${inp} min-w-0 flex-1`} value={mode} onChange={(e) => setMode(e.target.value as "smart" | "equal")}>
              <option value="smart">{t.editor.smart}</option>
              <option value="equal">{t.editor.equal}</option>
            </select>
            <button className="rounded-lg bg-brand px-3 font-semibold text-white disabled:opacity-50 dark:text-paper" disabled={marks.busy || total < 1} onClick={() => marks.run(call(`/api/v1/exams/${examId}`, "POST", { action: "distribute", total, mode }))}>{t.editor.distribute}</button>
          </div>
          {marks.err && <p role="alert" className="text-xs text-danger">{marks.err}</p>}
        </div>
      </div>

      {sections.length > 1 && (
        <div className="space-y-2 rounded-xl border border-line p-3 text-sm">
          <h2 className="font-semibold">{t.editor.optional.title}</h2>
          <p className="text-xs text-muted">{t.editor.optional.hint}</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5">{t.editor.optional.answers}
              <select className={`${inp} w-auto`} value={toAnswer} onChange={(e) => setToAnswer(Number(e.target.value))}>
                <option value={0}>{t.editor.optional.all}</option>
                {Array.from({ length: sections.length - 1 }, (_, k) => k + 1).map((k) => <option key={k} value={k}>{k.toLocaleString(lang === "EN" ? "en" : "ar-EG")} {fill(t.editor.optional.ofN, { n: sections.length.toLocaleString(lang === "EN" ? "en" : "ar-EG") })}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={first} disabled={toAnswer === 0} onChange={(e) => setFirst(e.target.checked)} />{t.editor.optional.firstRequired}</label>
            <button className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white disabled:opacity-50 dark:text-paper" disabled={pick.busy || (toAnswer === (sectionsToAnswer ?? 0) && first === firstRequired)} onClick={() => pick.run(call(`/api/v1/exams/${examId}`, "POST", { action: "meta", sectionsToAnswer: toAnswer || null, firstRequired: first }))}>{t.editor.optional.save}</button>
          </div>
          {pick.err && <p role="alert" className="text-xs text-danger">{pick.err}</p>}
        </div>
      )}

      {order.err && <p role="alert" className="text-xs text-danger">{order.err}</p>}
      {sections.map((s, i) => <Section key={`${s.id}:${s.marks}:${s.instruction}:${s.answerCount}:${s.passage ?? ""}`} s={s} i={i} count={sections.length} lang={lang} t={t} showAnswers={showAnswers} onMove={(d) => moveSection(i, d)} />)}

      {free.length > 0 && (
        <div className="space-y-2 rounded-xl border border-dashed border-line p-3 text-sm">
          <h2 className="font-semibold">{t.editor.addSection} <span className="text-xs font-normal text-muted">— {t.editor.addSectionHint}</span></h2>
          <div className="flex flex-wrap items-end gap-2">
            <select className={`${inp} min-w-0 flex-1`} value={newType} onChange={(e) => setNewType(e.target.value)}>{free.map((x) => <option key={x} value={x}>{t.qt[x] ?? x}</option>)}</select>
            <label className="space-y-1"><span className="block text-xs text-muted">{t.wizard.count}</span><input type="number" min={1} max={20} className={`${inp} w-20`} value={newCount} onChange={(e) => setNewCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></label>
            <label className="space-y-1"><span className="block text-xs text-muted">{t.wizard.marksEach}</span><input type="number" min={1} max={50} className={`${inp} w-20`} value={newMarks} onChange={(e) => setNewMarks(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} /></label>
            <button className="rounded-lg bg-brand px-4 py-1.5 font-semibold text-white disabled:opacity-50 dark:text-paper" disabled={add.busy || !newType} onClick={() => add.run(call(`/api/v1/exams/${examId}`, "POST", { action: "addSection", type: newType, count: newCount, marksEach: newMarks }))}>{add.busy ? t.editor.busy : t.editor.generate}</button>
          </div>
          {add.err && <p role="alert" className="text-xs text-danger">{add.err}</p>}
        </div>
      )}
    </div>
  );
}
