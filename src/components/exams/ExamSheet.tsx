"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TemplatesDict } from "@/lib/i18n/templates";
import { SheetFrame, type SheetFrameHandle } from "./SheetFrame";

type Props = {
  examId: string; html: string; variant: "questions" | "answers" | "key"; t: TemplatesDict; pageSize: "A4" | "A3"; orientation: "PORTRAIT" | "LANDSCAPE";
  templates: { id: string; name: string; preset: boolean; isDefault: boolean }[]; selectedTemplateId: string;
  fields: { key: string; label: string; placeholder: string }[]; values: Record<string, string>;
};

/** شريط ورقة الامتحان: النسخة، القالب، بيانات الترويسة، طباعة من الإطار، تنزيل PDF */
export function ExamSheet({ examId, html, variant, t, pageSize, orientation, templates, selectedTemplateId, fields, values }: Props) {
  const router = useRouter();
  const frame = useRef<SheetFrameHandle>(null);
  const [tplId, setTplId] = useState(selectedTemplateId);
  const [vals, setVals] = useState<Record<string, string>>(values);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "pdf">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const s = t.sheet;

  async function save(templateId = tplId, v = vals) {
    setBusy("save"); setMsg(null);
    const r = await fetch(`/api/v1/exams/${examId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "header", templateId, values: v }) }).catch(() => null);
    setBusy("");
    if (!r?.ok) {
      const code = (await r?.json().catch(() => null))?.error?.code;
      setMsg({ ok: false, text: t.errors[code] ?? t.errors.GENERIC });
      return;
    }
    setMsg({ ok: true, text: s.saved });
    router.refresh();
  }

  async function pdf() {
    setBusy("pdf"); setMsg(null);
    const r = await fetch(`/api/v1/exams/${examId}/export?variant=${variant}`).catch(() => null);
    if (!r?.ok) {
      setBusy("");
      const code = r?.status === 429 ? "RATE_LIMITED" : (await r?.json().catch(() => null))?.error?.code;
      setMsg({ ok: false, text: t.errors[code] ?? t.errors.GENERIC });
      return;
    }
    const blob = await r.blob();
    const cd = r.headers.get("content-disposition") ?? "";
    const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(cd)?.[1] ?? "exam.pdf");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setBusy("");
  }

  const tab = (v: Props["variant"], label: string) => (
    <a href={`/exams/${examId}/print?v=${v}`} className={`rounded-lg px-3 py-1.5 text-sm ${variant === v ? "bg-brand font-semibold text-white dark:text-paper" : "border border-line"}`}>{label}</a>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/exams/${examId}`} className="text-sm text-muted underline">{s.back}</Link>
        <span className="mx-2 h-5 w-px bg-line" />
        {tab("questions", s.questions)}{tab("answers", s.answers)}{tab("key", s.key)}
        <span className="flex-1" />
        <button onClick={() => frame.current?.print()} className="rounded-lg border border-line px-4 py-2 font-semibold">{s.print}</button>
        <button onClick={pdf} disabled={busy !== ""} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-60 dark:text-paper">{busy === "pdf" ? s.pdfBusy : s.pdf}</button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line p-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted">{s.template}</span>
          <select value={tplId} onChange={(e) => { setTplId(e.target.value); save(e.target.value); }} className="rounded-lg border border-line bg-transparent px-3 py-2">
            {templates.map((x) => <option key={x.id} value={x.id}>{x.name}{x.preset ? ` (${t.tpl.preset})` : x.isDefault ? ` (${t.tpl.default})` : ""}</option>)}
          </select>
        </label>
        <Link href="/exams/templates" className="pb-2 text-sm text-brand underline">{s.manage}</Link>
        <button onClick={() => setOpen(!open)} className="ms-auto rounded-lg border border-line px-3 py-2 text-sm">{s.header} {open ? "▲" : "▼"}</button>
      </div>

      {open && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <p className="text-sm text-muted">{s.headerHint}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <label key={f.key} className="text-sm">
                <span className="mb-1 block font-semibold">{f.label}</span>
                <input value={vals[f.key] ?? ""} placeholder={f.placeholder} maxLength={150} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} className="w-full rounded-lg border border-line bg-transparent px-3 py-2" />
              </label>
            ))}
          </div>
          <button onClick={() => save()} disabled={busy !== ""} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-60 dark:text-paper">{s.save}</button>
        </div>
      )}

      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{msg.text}</p>}

      <p className="text-xs text-muted">{s.preview}</p>
      <div className="rounded-xl bg-neutral-200 p-2 sm:p-4 dark:bg-neutral-800">
        <SheetFrame ref={frame} html={html} title={s.title} pageSize={pageSize} orientation={orientation} />
      </div>
    </div>
  );
}
