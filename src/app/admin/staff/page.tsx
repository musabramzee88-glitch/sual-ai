import { Act, JsonForm } from "@/components/AdminActions";
import { AdminShell, Pill, TableWrap, Td, Th } from "@/components/AdminShell";
import { ALL_PERMISSIONS } from "@/server/admin/guard";
import { adminCtx } from "@/server/admin/page";
import { listStaff } from "@/server/admin/service";

export default async function Page() {
  const { admin, site, t, L } = await adminCtx("MANAGE_STAFF");
  const staff = await listStaff();
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={t.staff.title}>
      <TableWrap>
        <thead><tr><Th>{t.common.name}</Th><Th>{t.common.email}</Th><Th>{t.staff.title}</Th><Th>{t.common.status}</Th><Th>{t.common.actions}</Th></tr></thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id}>
              <Td>{s.user.fullName}</Td><Td><span dir="ltr">{s.user.email}</span></Td>
              <Td>{s.user.role === "SUPER_ADMIN" ? <Pill>SUPER</Pill> : <div className="flex flex-wrap gap-1">{s.permissions.map((p) => <Pill key={p}>{t.staff.perms[p]}</Pill>)}</div>}</Td>
              <Td><Pill>{s.isActive ? t.statuses.ACTIVE : t.statuses.SUSPENDED}</Pill></Td>
              <Td>{admin.isSuper && s.user.role !== "SUPER_ADMIN" && s.user.id !== admin.auth.user.id && <Act L={L} method="PATCH" url={`/api/v1/admin/staff/${s.id}`} body={{ isActive: !s.isActive }} label={s.isActive ? t.act.suspend : t.act.activate} confirmText />}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <h2 className="mb-3 mt-8 font-semibold">{t.staff.add}</h2>
      {admin.isSuper ? (
        <JsonForm L={L} url="/api/v1/admin/staff" submit={t.common.create} fields={[{ name: "email", label: t.common.email, dir: "ltr" }]} extra={{ name: "permissions", label: t.staff.title, options: ALL_PERMISSIONS.map((p) => [p, t.staff.perms[p]]) }} />
      ) : <p className="text-sm text-muted">{t.staff.superOnly}</p>}
    </AdminShell>
  );
}
