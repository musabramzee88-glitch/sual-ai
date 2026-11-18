"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActLabels } from "./AdminActions";

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, code: (j.error?.code as string | undefined) ?? "GENERIC" };
}

/** محرر مجموعة اختيارات (صفوف المسار/الفرع، أنواع أسئلة المادة) يرسل PATCH بالحقل المحدد */
export function MultiCheckPatch({ url, field, options, initial, label, L, min = 0 }: {
  url: string; field: string; options: [string, string][]; initial: string[]; label: string; L: ActLabels; min?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(initial);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <button className="rounded-lg border border-line px-3 py-1 text-xs" onClick={() => setOpen(true)}>{label}</button>;
  return (
    <div className="mt-1 rounded-lg border border-line bg-paper p-2">
      <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
        {options.map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={sel.includes(k)} onChange={(e) => setSel(e.target.checked ? [...sel, k] : sel.filter((x) => x !== k))} />{l}</label>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button className="rounded-lg bg-brand px-3 py-1 text-xs text-white disabled:opacity-50 dark:text-paper" disabled={sel.length < min} onClick={async () => {
          setErr(null);
          const r = await send(url, "PATCH", { [field]: sel });
          if (r.ok) { setOpen(false); router.refresh(); } else setErr(L.errors[r.code] ?? L.errors.GENERIC);
        }}>{L.done}</button>
        <button className="rounded-lg border border-line px-3 py-1 text-xs" onClick={() => { setSel(initial); setOpen(false); }}>✕</button>
      </div>
      {err && <p role="alert" className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  );
}

type Ch = { id?: string; title: string; pageStart: string; pageEnd: string };
export type ChaptersLabels = { chTitle: string; from: string; to: string; add: string; up: string; down: string; remove: string; save: string; saved: string };

/** محرر الفصول: إضافة/تعديل/حذف/ترتيب ثم حفظ القائمة كاملة دفعة واحدة */
export function ChaptersEditor({ curriculumId, initial, t, L }: { curriculumId: string; initial: { id: string; title: string; pageStart: number | null; pageEnd: number | null }[]; t: ChaptersLabels; L: ActLabels }) {
  const router = useRouter();
  const [rows, setRows] = useState<Ch[]>(initial.map((c) => ({ id: c.id, title: c.title, pageStart: c.pageStart?.toString() ?? "", pageEnd: c.pageEnd?.toString() ?? "" })));
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const upd = (i: number, k: keyof Ch, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const n = [...rows];
    [n[i], n[j]] = [n[j], n[i]];
    setRows(n);
  };
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const input = "w-full rounded-lg border border-line bg-paper px-2 py-1.5 text-sm";
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[36rem] text-sm">
          <thead><tr className="text-muted"><th className="p-2 text-start">#</th><th className="p-2 text-start">{t.chTitle}</th><th className="p-2 text-start">{t.from}</th><th className="p-2 text-start">{t.to}</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? `new-${i}`} className="border-t border-line/60">
                <td className="p-2">{i + 1}</td>
                <td className="p-2"><input className={input} value={r.title} onChange={(e) => upd(i, "title", e.target.value)} /></td>
                <td className="w-24 p-2"><input className={input} dir="ltr" inputMode="numeric" value={r.pageStart} onChange={(e) => upd(i, "pageStart", e.target.value.replace(/\D/g, ""))} /></td>
                <td className="w-24 p-2"><input className={input} dir="ltr" inputMode="numeric" value={r.pageEnd} onChange={(e) => upd(i, "pageEnd", e.target.value.replace(/\D/g, ""))} /></td>
                <td className="whitespace-nowrap p-2">
                  <button className="px-1" onClick={() => move(i, -1)} aria-label={t.up}>{t.up}</button>
                  <button className="px-1" onClick={() => move(i, 1)} aria-label={t.down}>{t.down}</button>
                  <button className="px-1 text-danger" onClick={() => setRows(rows.filter((_, j) => j !== i))}>{t.remove}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="rounded-lg border border-line px-4 py-2 text-sm" onClick={() => setRows([...rows, { title: "", pageStart: "", pageEnd: "" }])}>{t.add}</button>
        <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-paper" onClick={async () => {
          setErr(null); setOk(false);
          const r = await send(`/api/v1/admin/curricula/${curriculumId}/chapters`, "PUT", { chapters: rows.map((c) => ({ ...(c.id ? { id: c.id } : {}), title: c.title, pageStart: num(c.pageStart), pageEnd: num(c.pageEnd) })) });
          if (r.ok) { setOk(true); router.refresh(); } else setErr(L.errors[r.code] ?? L.errors.GENERIC);
        }}>{t.save}</button>
        {ok && <span className="text-sm text-brand">{t.saved}</span>}
        {err && <span role="alert" className="text-sm text-danger">{err}</span>}
      </div>
    </div>
  );
}
