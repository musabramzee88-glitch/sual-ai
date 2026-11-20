"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExamDict } from "@/lib/i18n/exams";
import { MathText } from "./MathText";

export type EditorQuestion = { id: string; prompt: string; options: string[] | null; answer: string; marks: number; sourcePages: number[]; version: number };
export type EditorSection = { id: string; type: string; instruction: string; marks: number; branches: EditorQuestion[] };

const LETTERS_AR = ["أ", "ب", "ج", "د", "هـ", "و"];
const LETTERS_EN = ["a", "b", "c", "d", "e", "f"];
const toAr = (n: number) => n.toLocaleString("ar-EG");

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, code: j.error?.code as string | undefined };
}

function Question({ q, n, type, lang, t, showAnswer }: { q: EditorQuestion; n: number; type: string; lang: "AR" | "EN"; t: ExamDict; showAnswer: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(q.prompt);
  const [options, setOptions] = useState((q.options ?? []).join("\n"));
  const [answer, setAnswer] = useState(q.answer);
  const [marks, setMarks] = useState(q.marks);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const letters = lang === "EN" ? LETTERS_EN : LETTERS_AR;

  async function run(p: Promise<{ ok: boolean; code?: string }>) {
    setBusy(true);
    setErr(null);
    const r = await p;
    setBusy(false);
    if (!r.ok) { setErr(t.errors[r.code ?? "GENERIC"] ?? t.errors.GENERIC); return false; }
    router.refresh();
    return true;
  }
  const save = async () => {
    const opts = type === "MCQ" ? options.split("\n").map((s) => s.trim()).filter(Boolean) : undefined;
    if (await run(call(`/api/v1/exams/questions/${q.id}`, "PATCH", { prompt, answer, marks, ...(opts ? { options: opts } : {}) }))) setEditing(false);
  };

  return (
    <li className="space-y-2 rounded-lg border border-line bg-paper p-3">
      {!editing ? (
        <>
          <div className="flex items-start gap-2">
            <span className="shrink-0 font-semibold">{lang === "EN" ? `${n}.` : `${toAr(n)}-`}</span>
            <MathText text={q.prompt} className="flex-1" />
            <span className="shrink-0 text-xs text-muted">({lang === "EN" ? q.marks : toAr(q.marks)} {t.marksShort})</span>
          </div>
          {q.options && (
            <ol className="flex flex-wrap gap-x-6 gap-y-1 ps-6 text-sm">
              {q.options.map((o, i) => <li key={i}><span className="font-semibold">{letters[i]})</span> <MathText text={o} /></li>)}
            </ol>
          )}
          {showAnswer && <p className="rounded bg-brand-soft px-2 py-1 text-sm"><span className="font-semibold">{t.editor.answer}: </span><MathText text={q.answer} /></p>}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {q.sourcePages.map((p) => <span key={p} className="rounded-full border border-line px-2 py-0.5 text-muted">{t.editor.page} {p}</span>)}
            <span className="flex-1" />
            <button className="rounded border border-line px-2 py-1" disabled={busy} onClick={() => setEditing(true)}>{t.editor.edit}</button>
            <button className="rounded border border-line px-2 py-1" disabled={busy} onClick={() => run(call(`/api/v1/exams/questions/${q.id}`, "POST", { action: "regenerate" }))}>{busy ? t.editor.busy : t.editor.regenerate}</button>
            {q.version > 1 && <button className="rounded border border-line px-2 py-1" disabled={busy} onClick={() => run(call(`/api/v1/exams/questions/${q.id}`, "POST", { action: "undo" }))}>{t.editor.undo}</button>}
            <button className="rounded border border-line px-2 py-1 text-danger" disabled={busy} onClick={() => { if (window.confirm(t.editor.confirmDel)) run(call(`/api/v1/exams/questions/${q.id}`, "DELETE")); }}>{t.editor.del}</button>
          </div>
        </>
      ) : (
        <div className="space-y-2 text-sm">
          <label className="block space-y-1"><span className="text-muted">{t.editor.prompt}</span><textarea className="w-full rounded border border-line bg-surface p-2" rows={3} dir="auto" value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
          {type === "MCQ" && <label className="block space-y-1"><span className="text-muted">{t.editor.options}</span><textarea className="w-full rounded border border-line bg-surface p-2" rows={4} dir="auto" value={options} onChange={(e) => setOptions(e.target.value)} /></label>}
          <label className="block space-y-1"><span className="text-muted">{t.editor.answer}</span><textarea className="w-full rounded border border-line bg-surface p-2" rows={2} dir="auto" value={answer} onChange={(e) => setAnswer(e.target.value)} /></label>
          <label className="block w-32 space-y-1"><span className="text-muted">{t.marks}</span><input type="number" min={0} max={100} className="w-full rounded border border-line bg-surface p-2" value={marks} onChange={(e) => setMarks(Number(e.target.value))} /></label>
          <div className="flex gap-2">
            <button className="rounded bg-brand px-3 py-1.5 font-semibold text-white disabled:opacity-50 dark:text-paper" disabled={busy || !prompt.trim() || !answer.trim()} onClick={save}>{t.editor.save}</button>
            <button className="rounded border border-line px-3 py-1.5" onClick={() => { setEditing(false); setPrompt(q.prompt); setOptions((q.options ?? []).join("\n")); setAnswer(q.answer); setMarks(q.marks); }}>{t.editor.cancel}</button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </li>
  );
}

export function ExamEditor({ examId, sections, lang, t }: { examId: string; sections: EditorSection[]; lang: "AR" | "EN"; t: ExamDict }) {
  const router = useRouter();
  const [showAnswers, setShowAnswers] = useState(true);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <a href={`/exams/${examId}/print`} target="_blank" className="rounded-lg bg-brand px-4 py-2 font-semibold text-white dark:text-paper">{t.editor.print}</a>
        <a href={`/exams/${examId}/print?key=1`} target="_blank" className="rounded-lg border border-line px-4 py-2">{t.editor.printKey}</a>
        <label className="flex items-center gap-1.5 px-2"><input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} />{t.editor.showAnswers}</label>
        <span className="flex-1" />
        <button className="rounded-lg border border-line px-3 py-2 text-danger" onClick={async () => { if (window.confirm(t.editor.confirmDeleteExam) && (await call(`/api/v1/exams/${examId}`, "DELETE")).ok) router.push("/exams"); }}>{t.editor.deleteExam}</button>
      </div>
      {sections.map((s, i) => (
        <section key={s.id} className="space-y-2">
          <h2 className="flex items-baseline justify-between gap-2 font-semibold">
            <span>{lang === "EN" ? `Q${i + 1}: ` : `س${toAr(i + 1)}: `}{s.instruction}</span>
            <span className="shrink-0 text-sm font-normal text-muted">({lang === "EN" ? s.marks : toAr(s.marks)} {t.marksShort})</span>
          </h2>
          <ol className="space-y-2">{s.branches.map((q, j) => <Question key={`${q.id}:${q.version}`} q={q} n={j + 1} type={s.type} lang={lang} t={t} showAnswer={showAnswers} />)}</ol>
        </section>
      ))}
    </div>
  );
}
