import Link from "next/link";
import { AdminShell, Pill, TableWrap, Td, Th } from "@/components/AdminShell";
import { fmtDateTime, fmtIqd } from "@/lib/i18n/admin";
import { adminCtx } from "@/server/admin/page";
import { listPayments } from "@/server/admin/service";

export default async function Page() {
  const { admin, site, t } = await adminCtx("APPROVE_PAYMENTS");
  const rows = await listPayments(1);
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={t.nav.payments}>
      <TableWrap>
        <thead><tr><Th>{t.common.ref}</Th><Th>{t.common.user}</Th><Th>{t.common.amount}</Th><Th>{t.common.method}</Th><Th>{t.common.status}</Th><Th>{t.common.date}</Th><Th>{t.common.admin}</Th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><Td>{t.common.empty}</Td></tr>}
          {rows.map((p) => <tr key={p.id}><Td><span dir="ltr">{p.reference}</span></Td><Td><Link href={`/admin/users/${p.user.id}`} className="text-brand">{p.user.fullName}</Link></Td><Td>{fmtIqd(p.amountIqd, t)}</Td><Td>{t.statuses[p.method]}</Td><Td><Pill>{t.statuses[p.status]}</Pill></Td><Td>{fmtDateTime(p.createdAt)}</Td><Td>{p.approvedBy?.user.fullName ?? "—"}</Td></tr>)}
        </tbody>
      </TableWrap>
    </AdminShell>
  );
}
