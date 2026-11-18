import { AdminShell, Pill } from "@/components/AdminShell";
import { fmtIqd } from "@/lib/i18n/admin";
import { adminCtx } from "@/server/admin/page";
import { getStats } from "@/server/admin/service";

export default async function Page() {
  const { admin, site, t, locale } = await adminCtx("VIEW_DASHBOARD");
  const s = await getStats();
  const cards: [string, string | number][] = [
    [t.stats.teachers, s.teachers], [t.stats.activeAccounts, s.activeAccounts], [t.stats.activeSubs, s.activeSubs], [t.stats.expiredSubs, s.expiredSubs],
    [t.stats.pending, s.pendingRequests], [t.stats.revenue, fmtIqd(s.revenueIqd, t)], [t.stats.exams, s.exams],
  ];
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={t.nav.home}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([l, v]) => (
          <div key={l} className="rounded-xl border border-line bg-surface p-4"><div className="text-sm text-muted">{l}</div><div className="mt-1 text-2xl font-bold" dir="ltr">{v}</div></div>
        ))}
      </div>
      <h2 className="mb-2 mt-8 font-semibold">{t.stats.distribution}</h2>
      {s.distribution.length === 0 ? <p className="text-sm text-muted">{t.stats.none}</p> : (
        <ul className="space-y-1 text-sm">{s.distribution.map((d) => <li key={d.nameAr}>{locale === "ar" ? d.nameAr : d.nameEn} · {d.durationDays} {t.common.days} <Pill>{d.count}</Pill></li>)}</ul>
      )}
    </AdminShell>
  );
}
