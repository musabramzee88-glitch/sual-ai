"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type T = Dictionary["auth"];
type Gov = { code: string; nameAr: string; nameEn: string; directorates: { code: string; nameAr: string; nameEn: string }[] };

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, data: json.data, code: (json.error?.code as string | undefined) ?? "GENERIC" };
}

const input = "w-full rounded-xl border border-line bg-paper px-3 py-2.5 outline-none focus:border-brand";
const btn = "w-full rounded-xl bg-brand px-5 py-2.5 font-semibold text-white disabled:opacity-60 dark:text-paper";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      {children}
    </label>
  );
}
const Err = ({ t, code }: { t: T; code: string | null }) =>
  code ? <p role="alert" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-danger">{t.errors[code] ?? t.errors.GENERIC}</p> : null;

/** خطوة إدخال رمز OTP — تُستعمل بعد التسجيل وبعد الدخول */
export function OtpStep({ t, challengeId: initial, purpose }: { t: T; challengeId: string; purpose: "SIGNUP" | "LOGIN" }) {
  const router = useRouter();
  const [challengeId, setChallengeId] = useState(initial);
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(60);
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await post("/api/v1/auth/otp/verify", { challengeId, code, rememberDevice: purpose === "LOGIN" ? remember : undefined });
    setBusy(false);
    if (r.ok) { router.replace("/dashboard"); router.refresh(); } else setErr(r.code);
  }
  async function resend() {
    setErr(null);
    const r = await post("/api/v1/auth/otp/resend", { challengeId });
    if (r.ok) { setChallengeId(r.data.challengeId); setWait(60); setCode(""); } else setErr(r.code);
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted">{t.otpSent}</p>
      <Field label={t.code}>
        <input className={input + " text-center text-2xl tracking-[0.4em]"} dir="ltr" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      </Field>
      {purpose === "LOGIN" && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />{t.remember}</label>
      )}
      <Err t={t} code={err} />
      <button className={btn} disabled={busy || code.length !== 6}>{t.verify}</button>
      <button type="button" onClick={resend} disabled={wait > 0} className="w-full text-sm text-brand disabled:text-muted">{wait > 0 ? t.resendIn.replace("{s}", String(wait)) : t.resend}</button>
    </form>
  );
}

export function LoginForm({ t }: { t: T }) {
  const router = useRouter();
  const [f, setF] = useState({ identifier: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState<{ challengeId: string; purpose: "SIGNUP" | "LOGIN" } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await post("/api/v1/auth/login", f);
    setBusy(false);
    if (!r.ok) return setErr(r.code);
    if (r.data.step === "done") { router.replace("/dashboard"); router.refresh(); } else setOtp({ challengeId: r.data.challengeId, purpose: r.data.purpose });
  }
  if (otp) return <OtpStep t={t} {...otp} />;
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t.identifier}><input className={input} dir="ltr" autoComplete="username" required value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} /></Field>
      <Field label={t.password}><input className={input} type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      <Err t={t} code={err} />
      <button className={btn} disabled={busy}>{t.login}</button>
      <div className="flex justify-between text-sm"><Link href="/forgot-password" className="text-brand">{t.forgot}</Link><Link href="/register" className="text-brand">{t.noAccount}</Link></div>
    </form>
  );
}

export function RegisterForm({ t, locale }: { t: T; locale: "ar" | "en" }) {
  const [govs, setGovs] = useState<Gov[]>([]);
  const [f, setF] = useState({ fullName: "", phone: "", email: "", password: "", passwordConfirm: "", schoolName: "", governorateCode: "", directorateCode: "", specialization: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState<string | null>(null);
  useEffect(() => { fetch("/api/v1/geo/governorates").then((r) => r.json()).then((j) => setGovs(j.data ?? [])).catch(() => {}); }, []);
  const name = (x: { nameAr: string; nameEn: string }) => (locale === "ar" ? x.nameAr : x.nameEn);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value, ...(k === "governorateCode" ? { directorateCode: "" } : {}) });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await post("/api/v1/auth/register", f);
    setBusy(false);
    if (r.ok) setOtp(r.data.challengeId); else setErr(r.code);
  }
  if (otp) return <OtpStep t={t} challengeId={otp} purpose="SIGNUP" />;
  const dirs = govs.find((g) => g.code === f.governorateCode)?.directorates ?? [];
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t.fullName}><input className={input} autoComplete="name" required minLength={3} value={f.fullName} onChange={set("fullName")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.phone}><input className={input} dir="ltr" type="tel" autoComplete="tel" required value={f.phone} onChange={set("phone")} placeholder="07701234567" /></Field>
        <Field label={t.email}><input className={input} dir="ltr" type="email" autoComplete="email" required value={f.email} onChange={set("email")} /></Field>
        <Field label={t.password}><input className={input} type="password" autoComplete="new-password" required minLength={10} value={f.password} onChange={set("password")} /></Field>
        <Field label={t.passwordConfirm}><input className={input} type="password" autoComplete="new-password" required value={f.passwordConfirm} onChange={set("passwordConfirm")} /></Field>
      </div>
      <p className="text-xs text-muted">{t.passwordHint}</p>
      <Field label={t.school}><input className={input} required value={f.schoolName} onChange={set("schoolName")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.governorate}>
          <select className={input} required value={f.governorateCode} onChange={set("governorateCode")}><option value="">{t.choose}</option>{govs.map((g) => <option key={g.code} value={g.code}>{name(g)}</option>)}</select>
        </Field>
        <Field label={t.directorate}>
          <select className={input} required value={f.directorateCode} onChange={set("directorateCode")} disabled={!dirs.length}><option value="">{t.choose}</option>{dirs.map((d) => <option key={d.code} value={d.code}>{name(d)}</option>)}</select>
        </Field>
      </div>
      <Field label={t.specialization}><input className={input} required value={f.specialization} onChange={set("specialization")} /></Field>
      <Err t={t} code={err} />
      <button className={btn} disabled={busy}>{t.register}</button>
      <p className="text-center text-sm"><Link href="/login" className="text-brand">{t.haveAccount}</Link></p>
    </form>
  );
}

export function ForgotForm({ t }: { t: T }) {
  const [id, setId] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    const r = await post("/api/v1/auth/forgot-password", { identifier: id });
    if (r.ok) setDone(true); else setErr(r.code);
  }
  if (done) return <p className="text-sm">{t.forgotDone}</p>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t.identifier}><input className={input} dir="ltr" required value={id} onChange={(e) => setId(e.target.value)} /></Field>
      <Err t={t} code={err} />
      <button className={btn}>{t.submit}</button>
      <p className="text-center text-sm"><Link href="/login" className="text-brand">{t.backToLogin}</Link></p>
    </form>
  );
}

export function ResetForm({ t, token }: { t: T; token: string }) {
  const [f, setF] = useState({ password: "", passwordConfirm: "" });
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    const r = await post("/api/v1/auth/reset-password", { token, ...f });
    if (r.ok) setDone(true); else setErr(r.code);
  }
  if (done) return <div className="space-y-3 text-sm"><p>{t.resetDone}</p><Link href="/login" className="text-brand">{t.backToLogin}</Link></div>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t.password}><input className={input} type="password" autoComplete="new-password" required minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      <Field label={t.passwordConfirm}><input className={input} type="password" autoComplete="new-password" required value={f.passwordConfirm} onChange={(e) => setF({ ...f, passwordConfirm: e.target.value })} /></Field>
      <p className="text-xs text-muted">{t.passwordHint}</p>
      <Err t={t} code={err} />
      <button className={btn}>{t.submit}</button>
    </form>
  );
}

export function LogoutButton({ t }: { t: T }) {
  const router = useRouter();
  return <button className="rounded-lg border border-line px-4 py-2 text-sm" onClick={async () => { await post("/api/v1/auth/logout", {}); router.replace("/login"); router.refresh(); }}>{t.logout}</button>;
}
