import { AdminShell, TableWrap, Td, Th } from "@/components/AdminShell";
import { fmtDateTime } from "@/lib/i18n/admin";
import { adminCtx } from "@/server/admin/page";
import { listAudit } from "@/server/admin/service";

export default async function Page() {
  const { admin, site, t } = await adminCtx("VIEW_AUDIT_LOG");
  const rows = await listAudit(1);
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={t.audit.title}>
      <TableWrap>
        <thead><tr><Th>{t.common.date}</Th><Th>{t.common.admin}</Th><Th>{t.audit.action}</Th><Th>{t.audit.target}</Th><Th>IP</Th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><Td>{t.common.empty}</Td></tr>}
          {rows.map((r) => <tr key={r.id}><Td>{fmtDateTime(r.createdAt)}</Td><Td>{r.adminUser?.user.fullName ?? "—"}</Td><Td><span dir="ltr">{r.action}</span></Td><Td><span dir="ltr">{r.targetType}:{r.targetId?.slice(0, 10)}</span></Td><Td><span dir="ltr">{r.ip ?? "—"}</span></Td></tr>)}
        </tbody>
      </TableWrap>
    </AdminShell>
  );
}
