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
