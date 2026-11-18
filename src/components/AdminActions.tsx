"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Ask = { field: string; label: string; number?: boolean };
export type ActLabels = { confirm: string; done: string; errors: Record<string, string> };

/** زر يرسل طلب JSON إلى الـ API ثم يحدّث الصفحة. التحقق والصلاحيات تتم على الخادم. */
export function Act({ url, method = "POST", body = {}, label, ask, confirmText, tone = "default", L }: {
  url: string; method?: "POST" | "PATCH" | "PUT" | "DELETE"; body?: Record<string, unknown>; label: string; ask?: Ask; confirmText?: boolean; tone?: "default" | "danger" | "ok"; L: ActLabels;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run() {
    const payload = { ...body };
    if (ask) {
      const v = window.prompt(ask.label);
      if (v === null || v.trim() === "") return;
      payload[ask.field] = ask.number ? Number(v) : v.trim();
    } else if (confirmText && !window.confirm(L.confirm)) return;
    setBusy(true); setErr(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) router.refresh(); else setErr(L.errors[j.error?.code] ?? L.errors.GENERIC);
  }
  const cls = tone === "danger" ? "border-danger text-danger" : tone === "ok" ? "bg-brand text-white dark:text-paper border-brand" : "border-line";
  return (
    <span className="inline-flex flex-col">
      <button onClick={run} disabled={busy} className={`rounded-lg border px-3 py-1 text-xs font-medium disabled:opacity-50 ${cls}`}>{label}</button>
      {err && <span role="alert" className="mt-1 text-xs text-danger">{err}</span>}
    </span>
  );
}

const input = "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand";

/** نموذج JSON عام: حقول بسيطة → إرسال إلى API */
export function JsonForm({ url, method = "POST", fields, submit, L, extra }: {
  url: string; method?: "POST" | "PUT"; submit: string; L: ActLabels;
  fields: { name: string; label: string; type?: "text" | "number" | "textarea" | "select"; options?: [string, string][]; required?: boolean; dir?: "ltr" }[];
  extra?: { name: string; label: string; options: [string, string][] };
}) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.type === "select" ? f.options![0][0] : ""])));
  const [perms, setPerms] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setOk(false);
    const body: Record<string, unknown> = {};
    for (const f of fields) if (v[f.name] !== "") body[f.name] = f.type === "number" ? Number(v[f.name]) : v[f.name];
    if (extra) body[extra.name] = perms;
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setOk(true); router.refresh(); } else setErr(L.errors[j.error?.code] ?? L.errors.GENERIC);
  }
  return (
    <form onSubmit={send} className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <label key={f.name} className={`block text-sm ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
          <span className="mb-1 block text-muted">{f.label}</span>
          {f.type === "textarea" ? <textarea className={input} rows={5} required={f.required !== false} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
            : f.type === "select" ? <select className={input} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>{f.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            : <input className={input} dir={f.dir} type={f.type === "number" ? "number" : "text"} required={f.required !== false} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />}
        </label>
      ))}
      {extra && (
        <fieldset className="sm:col-span-2"><legend className="mb-1 text-sm text-muted">{extra.label}</legend>
          <div className="grid gap-1 sm:grid-cols-2">{extra.options.map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={perms.includes(k)} onChange={(e) => setPerms(e.target.checked ? [...perms, k] : perms.filter((x) => x !== k))} />{l}</label>
          ))}</div>
        </fieldset>
      )}
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white dark:text-paper">{submit}</button>
        {ok && <span className="text-sm text-brand">{L.done}</span>}
        {err && <span role="alert" className="text-sm text-danger">{err}</span>}
      </div>
    </form>
  );
}
