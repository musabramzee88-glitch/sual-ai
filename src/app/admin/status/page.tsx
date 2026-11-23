import { AdminShell } from "@/components/AdminShell";
import { adminCtx } from "@/server/admin/page";
import { systemStatus } from "@/server/admin/status";
import { MathText } from "@/components/exams/MathText";

export const dynamic = "force-dynamic";
export const metadata = { title: "حالة النظام" };

const TONE = { ok: "border-line bg-surface", warn: "border-accent bg-accent-soft", error: "border-danger bg-accent-soft" } as const;
const DOT = { ok: "bg-brand", warn: "bg-accent", error: "bg-danger" } as const;

/** حالة النظام للمدير الرئيسي (صلاحية إدارة الموظفين): كل فحص بمستواه وما يجب فعله */
export default async function Page() {
  const { admin, site, t } = await adminCtx("MANAGE_STAFF");
  const s = t.status;
  const st = await systemStatus();
  const up = st.uptimeSec < 3600 ? `${Math.round(st.uptimeSec / 60)} ${s.minutes}` : `${Math.round(st.uptimeSec / 3600)} ${s.hours}`;
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={s.title}>
      <div className="space-y-4">
        <p className="text-sm leading-7 text-muted">{s.intro}</p>
        <div role="status" className={`flex items-center gap-3 rounded-xl border p-4 font-semibold ${TONE[st.overall]}`}>
          <span className={`h-3 w-3 rounded-full ${DOT[st.overall]}`} aria-hidden />{s[st.overall]}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {st.checks.map((c) => (
            <li key={c.key} className={`rounded-xl border p-4 ${TONE[c.level]}`}>
              <div className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${DOT[c.level]}`} aria-hidden />{s.names[c.key] ?? c.key}</div>
              <p className="mt-1 text-sm"><MathText text={c.value} /></p>
              {c.hint && <p className="mt-1 text-xs leading-6 text-muted"><MathText text={c.hint} /></p>}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">{s.version}: <span dir="ltr">{st.version ?? "—"}</span> · {s.uptime}: {up} · {s.checked}: <span dir="ltr">{new Date(st.checkedAt).toLocaleString("en-GB")}</span></p>
      </div>
    </AdminShell>
  );
}
