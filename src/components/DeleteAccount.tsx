"use client";
import { useState } from "react";

const T = {
  ar: { title: "حذف الحساب", body: "يحذف امتحاناتك وقوالبك وصورك وبياناتك الشخصية نهائياً، ولا يمكن التراجع. سجلات الدفع تبقى محفوظة كما يلزم القانون.", open: "حذف حسابي", pw: "كلمة المرور", type: "اكتب DELETE للتأكيد", go: "احذف نهائياً", cancel: "إلغاء", bad: "كلمة المرور غير صحيحة.", admin: "حساب إداري: يُزال من لوحة الإدارة أولاً.", err: "تعذّر الحذف، حاول مرة أخرى." },
  en: { title: "Delete account", body: "Permanently deletes your exams, templates, images and personal data. This cannot be undone. Payment records are kept as required by law.", open: "Delete my account", pw: "Password", type: "Type DELETE to confirm", go: "Delete permanently", cancel: "Cancel", bad: "Incorrect password.", admin: "Staff account: remove it from the admin panel first.", err: "Could not delete, try again." },
};

/** حذف الحساب بطلب صاحبه (POST /api/v1/account/delete) */
export function DeleteAccount({ locale }: { locale: "ar" | "en" }) {
  const t = T[locale];
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true); setErr(null);
    const r = await fetch("/api/v1/account/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw, confirm: "DELETE" }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) { window.location.href = "/"; return; }
    const code = r ? ((await r.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code : null;
    setErr(code === "INVALID_PASSWORD" ? t.bad : code === "ADMIN_ACCOUNT" ? t.admin : t.err);
  }
  return (
    <section className="mt-8 rounded-xl border border-danger/40 p-4">
      <h2 className="font-bold text-danger">{t.title}</h2>
      <p className="mt-1 text-sm text-muted">{t.body}</p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="mt-3 rounded-lg border border-danger px-4 py-2 text-sm font-semibold text-danger">{t.open}</button>
      ) : (
        <div className="mt-3 grid gap-2">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t.pw} className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          <input dir="ltr" value={word} onChange={(e) => setWord(e.target.value)} placeholder={t.type} className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy || !pw || word !== "DELETE"} onClick={go} className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t.go}</button>
            <button onClick={() => { setOpen(false); setPw(""); setWord(""); setErr(null); }} className="rounded-lg px-4 py-2 text-sm">{t.cancel}</button>
          </div>
        </div>
      )}
    </section>
  );
}
