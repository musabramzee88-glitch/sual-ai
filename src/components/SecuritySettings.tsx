"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type T = Dictionary["security"];
type A = Dictionary["auth"];
type State = { loginSecurity: "SINGLE" | "BOTH"; emailVerified: boolean; phoneVerified: boolean; smsAvailable: boolean };

async function call(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, data: j.data, code: (j.error?.code as string | undefined) ?? "GENERIC" };
}
const input = "w-full rounded-xl border border-line bg-paper px-3 py-2.5 outline-none focus:border-brand";
const btn = "rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:text-paper";

function VerifyChannel({ t, a, channel }: { t: T; a: A; channel: "EMAIL" | "PHONE" }) {
  const router = useRouter();
  const [challenge, setChallenge] = useState<{ challengeId: string; masked: string } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-2 space-y-2">
      {!challenge ? (
        <button className={btn} onClick={async () => { setErr(null); const r = await call("/api/v1/account/security/verify/start", "POST", { channel }); if (r.ok) setChallenge(r.data.challenge); else setErr(r.code); }}>{t.verify}</button>
      ) : (
        <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => { e.preventDefault(); setErr(null); const r = await call("/api/v1/account/security/verify/confirm", "POST", { challengeId: challenge.challengeId, code }); if (r.ok) router.refresh(); else setErr(r.code); }}>
          <span className="text-xs text-muted">{a.sentTo} {challenge.masked}</span>
          <input className={input + " max-w-40 text-center tracking-widest"} dir="ltr" inputMode="numeric" maxLength={6} placeholder={t.code} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          <button className={btn} disabled={code.length !== 6}>{t.confirm}</button>
        </form>
      )}
      {err && <p role="alert" className="text-sm text-danger">{a.errors[err] ?? a.errors.GENERIC}</p>}
    </div>
  );
}

export function SecuritySettings({ t, a, state }: { t: T; a: A; state: State }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const both = state.loginSecurity === "BOTH";
  const canEnable = state.emailVerified && state.phoneVerified && state.smsAvailable;
  const row = (label: string, verified: boolean, ch: "EMAIL" | "PHONE") => (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-center justify-between text-sm"><span>{label}</span><span className={verified ? "text-brand" : "text-muted"}>{verified ? t.verified : t.notVerified}</span></div>
      {!verified && (ch === "EMAIL" || state.smsAvailable) && <VerifyChannel t={t} a={a} channel={ch} />}
    </div>
  );
  async function toggle(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setOk(false);
    const r = await call("/api/v1/account/security", "PUT", { mode: both ? "SINGLE" : "BOTH", password });
    if (r.ok) { setOk(true); setPassword(""); router.refresh(); } else setErr(r.code);
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">{t.intro}</p>
      <div className="grid gap-3 sm:grid-cols-2">{row(t.emailStatus, state.emailVerified, "EMAIL")}{row(t.phoneStatus, state.phoneVerified, "PHONE")}</div>
      {!state.smsAvailable && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">{t.smsOff}</p>}
      <section className="rounded-xl border border-line p-4">
        <h2 className="font-semibold">{t.modeTitle}</h2>
        <p className="mt-1 text-sm text-muted">{both ? t.modeOn : t.modeOff}</p>
        {!both && !canEnable && state.smsAvailable && <p className="mt-2 text-sm text-muted">{t.needBoth}</p>}
        {(both || canEnable) && (
          <form onSubmit={toggle} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="block text-sm"><span className="mb-1 block text-muted">{t.password}</span>
              <input className={input} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <button className={btn}>{both ? t.disable : t.enable}</button>
          </form>
        )}
        {ok && <p className="mt-2 text-sm text-brand">{t.done}</p>}
        {err && <p role="alert" className="mt-2 text-sm text-danger">{a.errors[err] ?? a.errors.GENERIC}</p>}
      </section>
    </div>
  );
}
