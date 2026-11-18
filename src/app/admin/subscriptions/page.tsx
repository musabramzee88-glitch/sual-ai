import Link from "next/link";
import { AdminShell, Pill, TableWrap, Td, Th } from "@/components/AdminShell";
import { fmtDate } from "@/lib/i18n/admin";
import { adminCtx } from "@/server/admin/page";
import { listSubscriptions } from "@/server/admin/service";

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const { admin, site, t, pick } = await adminCtx("MANAGE_SUBSCRIPTIONS");
  const r = await listSubscriptions({ status: sp.status, page: Number(sp.page) || 1 });
  const now = Date.now();
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={`${t.nav.subscriptions} (${r.total})`}>
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <Link href="/admin/subscriptions" className="text-brand">{t.common.all}</Link>
        {["ACTIVE", "PENDING_APPROVAL", "EXPIRED", "SUSPENDED", "CANCELLED"].map((s) => <Link key={s} href={`/admin/subscriptions?status=${s}`} className="text-brand">{t.statuses[s]}</Link>)}
      </div>
      <TableWrap>
        <thead><tr><Th>{t.common.user}</Th><Th>{t.common.plan}</Th><Th>{t.common.status}</Th><Th>{t.common.starts}</Th><Th>{t.common.ends}</Th></tr></thead>
        <tbody>
          {r.rows.length === 0 && <tr><Td>{t.common.empty}</Td></tr>}
          {r.rows.map((s) => {
            const lapsed = s.status === "ACTIVE" && s.endsAt && s.endsAt.getTime() <= now;
            return <tr key={s.id}><Td><Link href={`/admin/users/${s.user.id}`} className="text-brand">{s.user.fullName}</Link></Td><Td>{pick(s.plan)}</Td><Td><Pill>{lapsed ? t.statuses.EXPIRED : t.statuses[s.status]}</Pill></Td><Td>{fmtDate(s.startsAt)}</Td><Td>{fmtDate(s.endsAt)}</Td></tr>;
          })}
        </tbody>
      </TableWrap>
    </AdminShell>
  );
}
