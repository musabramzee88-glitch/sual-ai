import Link from "next/link";
import { AdminShell, Pill, TableWrap, Td, Th } from "@/components/AdminShell";
import { fmtDate } from "@/lib/i18n/admin";
import { adminCtx } from "@/server/admin/page";
import { listUsers } from "@/server/admin/service";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  const { admin, site, t } = await adminCtx("MANAGE_USERS");
  const r = await listUsers({ q: sp.q, status: sp.status, page: Number(sp.page) || 1 });
  const qs = (p: number) => `?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.status ? { status: sp.status } : {}), page: String(p) })}`;
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={`${t.users.title} (${r.total})`}>
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder={t.common.search} className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-line bg-paper px-3 py-2 text-sm">
          <option value="">{t.common.all}</option>
          {["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "BANNED"].map((s) => <option key={s} value={s}>{t.statuses[s]}</option>)}
        </select>
        <button className="rounded-lg bg-brand px-4 py-2 text-sm text-white dark:text-paper">{t.common.search}</button>
      </form>
      <TableWrap>
        <thead><tr><Th>{t.common.name}</Th><Th>{t.common.email}</Th><Th>{t.common.phone}</Th><Th>{t.common.status}</Th><Th>{t.users.subs}</Th><Th>{t.common.date}</Th></tr></thead>
        <tbody>
          {r.rows.length === 0 && <tr><Td>{t.common.empty}</Td></tr>}
          {r.rows.map((u) => (
            <tr key={u.id}>
              <Td><Link href={`/admin/users/${u.id}`} className="text-brand">{u.fullName}</Link></Td>
              <Td className="break-all" ><span dir="ltr">{u.email}</span></Td><Td><span dir="ltr">{u.phone}</span></Td>
              <Td><Pill>{t.statuses[u.status]}</Pill></Td>
              <Td>{u.subscriptions[0] ? <>{t.statuses[u.subscriptions[0].status]} · {fmtDate(u.subscriptions[0].endsAt)}</> : "—"}</Td>
              <Td>{fmtDate(u.createdAt)}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <div className="mt-4 flex items-center gap-3 text-sm">
        {r.page > 1 && <Link href={qs(r.page - 1)} className="text-brand">{t.common.prev}</Link>}
        <span className="text-muted">{r.page} / {r.pages}</span>
        {r.page < r.pages && <Link href={qs(r.page + 1)} className="text-brand">{t.common.next}</Link>}
      </div>
    </AdminShell>
  );
}
