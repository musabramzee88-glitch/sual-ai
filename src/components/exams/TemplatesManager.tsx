"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TemplatesDict } from "@/lib/i18n/templates";
import { SheetFrame } from "./SheetFrame";
import { renderExamHtml, type HeaderKey, type Layout, type RenderExam } from "@/lib/exam-render";

type Tpl = {
  id: string; preset: boolean; isDefault: boolean; name: string; layout: Layout; pageSize: "A4" | "A3"; orientation: "PORTRAIT" | "LANDSCAPE";
  fontFamily: string; fontSizePt: number; lineSpacing: number; margins: { top: number; right: number; bottom: number; left: number };
  showPageNumbers: boolean; visible: Partial<Record<HeaderKey, boolean>>; values: Partial<Record<HeaderKey, string>>;
  answerLines: number; footerNote: string | null; logoAssetId: string | null;
};
type Field = { key: HeaderKey; label: string; hidden: boolean; auto: boolean };

/** امتحان قصير للمعاينة الحية (نفس العارض الحقيقي) */
const SAMPLE: Record<"ar" | "en", RenderExam> = {
  ar: {
    lang: "AR", values: { title: "الامتحان الشهري الأول", subject: "العلوم", grade: "الخامس الابتدائي", time: "٤٥ دقيقة", total: "٢٠ درجة", examKind: "الامتحان الشهري", model: "أ" },
    sections: [
      { instruction: "عرّف ما يأتي:", marks: 10, branches: [{ prompt: "الخلية", options: null, answer: "", marks: 5 }, { prompt: "النسيج", options: null, answer: "", marks: 5 }] },
      { instruction: "اختر الإجابة الصحيحة لكل مما يأتي:", marks: 10, branches: [{ prompt: "وحدة قياس الكتلة هي:", options: ["kg", "m", "s"], answer: "", marks: 10 }] },
    ],
  },
  en: {
    lang: "EN", values: { title: "First monthly exam", subject: "Science", grade: "Grade 5", time: "45 minutes", total: "20 marks", examKind: "Monthly exam", model: "A" },
    sections: [
      { instruction: "Define:", marks: 10, branches: [{ prompt: "Cell", options: null, answer: "", marks: 5 }, { prompt: "Tissue", options: null, answer: "", marks: 5 }] },
      { instruction: "Choose the correct answer:", marks: 10, branches: [{ prompt: "The unit of mass is:", options: ["kg", "m", "s"], answer: "", marks: 10 }] },
    ],
  },
};

const inputCls = "w-full rounded-lg border border-line bg-transparent px-3 py-2";

export function TemplatesManager({ t, templates, logos: initialLogos, fonts, fields, lang }: { t: TemplatesDict; templates: Tpl[]; logos: string[]; fonts: string[]; fields: Field[]; lang: "ar" | "en" }) {
  const router = useRouter();
  const T = t.tpl;
  const [edit, setEdit] = useState<(Tpl & { isNew: boolean }) | null>(null);
  const [logos, setLogos] = useState(initialLogos);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const err = async (r: Response | null) => t.errors[(await r?.json().catch(() => null))?.error?.code] ?? (r?.status === 429 ? t.errors.RATE_LIMITED : t.errors.GENERIC);

  async function save() {
    if (!edit) return;
    setBusy(true); setMsg(null);
    const { id, isNew, preset: _p, ...body } = edit;
    void _p;
    const r = await fetch(isNew ? "/api/v1/templates" : `/api/v1/templates/${id}`, { method: isNew ? "POST" : "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg({ ok: false, text: await err(r) });
    setMsg({ ok: true, text: T.saved });
    setEdit(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm(T.confirmDel)) return;
    const r = await fetch(`/api/v1/templates/${id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) return setMsg({ ok: false, text: await err(r) });
    router.refresh();
  }

  async function upload(file: File) {
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/v1/templates/logos", { method: "POST", body: fd }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg({ ok: false, text: await err(r) });
    const id = (await r.json()).data.id as string;
    setLogos((l) => (l.includes(id) ? l : [id, ...l]));
    setEdit((e) => (e ? { ...e, logoAssetId: id } : e));
  }

  const mine = templates.filter((x) => !x.preset);
  const presets = templates.filter((x) => x.preset);
  const row = (x: Tpl) => (
    <li key={x.id} className="flex items-center gap-3 p-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{x.name} {x.isDefault && <span className="ms-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">{T.default}</span>}</p>
        <p className="text-xs text-muted">{T.layouts[x.layout]} · {x.pageSize} · {x.fontFamily} {x.fontSizePt}pt</p>
      </div>
      {x.preset ? (
        <button onClick={() => setEdit({ ...x, isNew: true, name: x.name, isDefault: mine.length === 0 })} className="rounded-lg border border-line px-3 py-1">{T.useAsBase}</button>
      ) : (
        <>
          <button onClick={() => setEdit({ ...x, isNew: false })} className="rounded-lg border border-line px-3 py-1">{T.edit}</button>
          <button onClick={() => setEdit({ ...x, id: "", isNew: true, name: `${x.name} 2`, isDefault: false })} className="rounded-lg border border-line px-3 py-1">{T.useAsBase}</button>
          <button onClick={() => remove(x.id)} className="rounded-lg border border-line px-3 py-1 text-danger">{T.del}</button>
        </>
      )}
    </li>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">{T.title}</h1>
        <p className="mt-1 text-sm text-muted">{T.intro}</p>
      </div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{msg.text}</p>}
      {edit ? (
        <Editor t={t} tpl={edit} set={setEdit} logos={logos} fonts={fonts} fields={fields} lang={lang} busy={busy} onSave={save} onUpload={upload} onCancel={() => setEdit(null)} />
      ) : (
        <>
          <section>
            <h2 className="mb-2 font-semibold">{T.mine}</h2>
            {mine.length ? <ul className="divide-y divide-line rounded-xl border border-line bg-surface">{mine.map(row)}</ul> : <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">{T.none}</p>}
          </section>
          <section>
            <h2 className="mb-2 font-semibold">{T.presets}</h2>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">{presets.map(row)}</ul>
          </section>
          <p className="text-xs text-muted">{T.note}</p>
        </>
      )}
    </div>
  );
}

function Editor({ t, tpl, set, logos, fonts, fields, lang, busy, onSave, onUpload, onCancel }: {
  t: TemplatesDict; tpl: Tpl & { isNew: boolean }; set: (f: (e: (Tpl & { isNew: boolean }) | null) => (Tpl & { isNew: boolean }) | null) => void;
  logos: string[]; fonts: string[]; fields: Field[]; lang: "ar" | "en"; busy: boolean; onSave: () => void; onUpload: (f: File) => void; onCancel: () => void;
}) {
  const T = t.tpl;
  const up = (patch: Partial<Tpl>) => set((e) => (e ? { ...e, ...patch } : e));
  const [logoUri, setLogoUri] = useState<Record<string, string>>({});
  // المعاينة: الشعار يُضمَّن كـ data URI (الإطار المعزول لا يحمّل روابط الخادم)
  const logoId = tpl.logoAssetId;
  useEffect(() => {
    if (!logoId || logoUri[logoId] !== undefined) return;
    let live = true;
    fetch(`/api/v1/templates/logos/${logoId}`).then((r) => (r.ok ? r.blob() : null)).then((b) => {
      if (!b || !live) return;
      const fr = new FileReader();
      fr.onload = () => setLogoUri((m) => ({ ...m, [logoId]: String(fr.result) }));
      fr.readAsDataURL(b);
    }).catch(() => {});
    return () => { live = false; };
  }, [logoId, logoUri]);
  const html = useMemo(() => renderExamHtml(SAMPLE[lang], {
    layout: tpl.layout, pageSize: tpl.pageSize, orientation: tpl.orientation, fontFamily: tpl.fontFamily, fontSizePt: tpl.fontSizePt, lineSpacing: tpl.lineSpacing,
    margins: tpl.margins, visible: tpl.visible, values: tpl.values, logoDataUri: tpl.logoAssetId ? logoUri[tpl.logoAssetId] || null : null,
    answerLines: tpl.answerLines, footerNote: tpl.footerNote,
  }, "QUESTIONS_ONLY"), [tpl, logoUri, lang]);
  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(v) || min));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-4">
        <label className="block text-sm"><span className="mb-1 block font-semibold">{T.name}</span><input className={inputCls} value={tpl.name} maxLength={80} onChange={(e) => up({ name: e.target.value })} /></label>
        <label className="block text-sm"><span className="mb-1 block font-semibold">{T.layout}</span>
          <select className={inputCls} value={tpl.layout} onChange={(e) => up({ layout: e.target.value as Layout })}>{Object.entries(T.layouts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>

        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">{T.page}</legend>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label><span className="mb-1 block">{T.pageSize}</span><select className={inputCls} value={tpl.pageSize} onChange={(e) => up({ pageSize: e.target.value as "A4" | "A3" })}><option>A4</option><option>A3</option></select></label>
            <label><span className="mb-1 block">{T.orientation}</span><select className={inputCls} value={tpl.orientation} onChange={(e) => up({ orientation: e.target.value as Tpl["orientation"] })}><option value="PORTRAIT">{T.portrait}</option><option value="LANDSCAPE">{T.landscape}</option></select></label>
            <label><span className="mb-1 block">{T.font}</span><select className={inputCls} value={tpl.fontFamily} onChange={(e) => up({ fontFamily: e.target.value })}>{fonts.map((f) => <option key={f}>{f}</option>)}</select></label>
            <label><span className="mb-1 block">{T.fontSize}</span><input type="number" min={10} max={22} className={inputCls} value={tpl.fontSizePt} onChange={(e) => up({ fontSizePt: num(e.target.value, 10, 22) })} /></label>
            <label><span className="mb-1 block">{T.lineSpacing}</span><input type="number" step={0.1} min={1} max={2.5} className={inputCls} value={tpl.lineSpacing} onChange={(e) => up({ lineSpacing: Math.min(2.5, Math.max(1, Number(e.target.value) || 1)) })} /></label>
            <label><span className="mb-1 block">{T.answerLines}</span><input type="number" min={0} max={8} className={inputCls} value={tpl.answerLines} onChange={(e) => up({ answerLines: num(e.target.value, 0, 8) })} /></label>
          </div>
          <p className="mb-1 mt-3 text-sm">{T.margins}</p>
          <div className="grid grid-cols-4 gap-2 text-sm">
            {(["top", "right", "bottom", "left"] as const).map((k) => (
              <label key={k}><span className="mb-1 block text-xs text-muted">{T[k]}</span><input type="number" min={5} max={40} className={inputCls} value={tpl.margins[k]} onChange={(e) => up({ margins: { ...tpl.margins, [k]: num(e.target.value, 5, 40) } })} /></label>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={tpl.showPageNumbers} onChange={(e) => up({ showPageNumbers: e.target.checked })} />{T.pageNumbers}</label>
        </fieldset>

        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">{T.logo}</legend>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => up({ logoAssetId: null })} className={`h-16 rounded-lg border px-3 text-sm ${!tpl.logoAssetId ? "border-brand ring-2 ring-brand" : "border-line"}`}>{T.noLogo}</button>
            {logos.map((id) => (
              <button key={id} onClick={() => up({ logoAssetId: id })} className={`h-16 w-16 rounded-lg border bg-white p-1 ${tpl.logoAssetId === id ? "border-brand ring-2 ring-brand" : "border-line"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/v1/templates/logos/${id}`} alt="" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
          <label className="mt-2 block text-sm"><span className="mb-1 block text-muted">{T.upload}</span>
            <input type="file" accept="image/png,image/jpeg" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
          </label>
        </fieldset>

        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">{T.fields}</legend>
          <p className="mb-2 text-xs text-muted">{T.fieldsHint}</p>
          <div className="space-y-2">
            {fields.map((f) => {
              const on = tpl.visible[f.key] ?? !f.hidden;
              return (
                <div key={f.key} className="grid grid-cols-[auto_8rem_1fr] items-center gap-2 text-sm">
                  <input type="checkbox" aria-label={`${T.show}: ${f.label}`} checked={on} onChange={(e) => up({ visible: { ...tpl.visible, [f.key]: e.target.checked } })} />
                  <span className={on ? "" : "text-muted line-through"}>{f.label}</span>
                  {f.key === "student" || f.key === "section" ? <span /> : (
                    <input className={`${inputCls} py-1`} disabled={!on} maxLength={150} placeholder={f.auto ? T.auto : T.value} value={tpl.values[f.key] ?? ""} onChange={(e) => up({ values: { ...tpl.values, [f.key]: e.target.value } })} />
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>

        <label className="block text-sm"><span className="mb-1 block font-semibold">{T.footer}</span><input className={inputCls} maxLength={200} value={tpl.footerNote ?? ""} onChange={(e) => up({ footerNote: e.target.value || null })} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tpl.isDefault} onChange={(e) => up({ isDefault: e.target.checked })} />{T.isDefault}</label>
        <div className="flex gap-2">
          <button onClick={onSave} disabled={busy || !tpl.name.trim()} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-60 dark:text-paper">{T.save}</button>
          <button onClick={onCancel} className="rounded-lg border border-line px-4 py-2">{T.cancel}</button>
        </div>
      </div>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl bg-neutral-200 p-3 dark:bg-neutral-800">
          <SheetFrame html={html} title="preview" pageSize={tpl.pageSize} orientation={tpl.orientation} />
        </div>
      </div>
    </div>
  );
}
