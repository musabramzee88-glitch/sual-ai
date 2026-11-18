import { Act, JsonForm } from "@/components/AdminActions";
import { AdminShell, Pill, TableWrap, Td, Th } from "@/components/AdminShell";
import { fmtIqd } from "@/lib/i18n/admin";
import { adminCtx } from "@/server/admin/page";
import { listPlans } from "@/server/admin/service";

export default async function Page() {
  const { admin, site, t, L, pick } = await adminCtx("MANAGE_PLANS");
  const plans = await listPlans();
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={t.plans.title}>
      <p className="mb-4 text-sm text-muted">{t.plans.hint}</p>
      <TableWrap>
        <thead><tr><Th>{t.plans.code}</Th><Th>{t.common.name}</Th><Th>{t.plans.duration}</Th><Th>{t.plans.price}</Th><Th>{t.plans.active}</Th><Th>{t.common.actions}</Th></tr></thead>
        <tbody>
          {plans.length === 0 && <tr><Td>{t.common.empty}</Td></tr>}
          {plans.map((p) => (
            <tr key={p.id}>
              <Td><span dir="ltr">{p.code}</span></Td><Td>{pick(p)}</Td><Td>{p.durationDays}</Td><Td>{fmtIqd(p.priceIqd, t)}</Td><Td><Pill>{p.isActive ? t.common.yes : t.common.no}</Pill></Td>
              <Td><div className="flex gap-1">
                <Act L={L} method="PATCH" url={`/api/v1/admin/plans/${p.id}`} body={{ isActive: !p.isActive }} label={p.isActive ? t.plans.disable : t.plans.enable} />
                <Act L={L} method="PATCH" url={`/api/v1/admin/plans/${p.id}`} label={t.plans.price} ask={{ field: "priceIqd", label: t.plans.price, number: true }} />
              </div></Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <h2 className="mb-3 mt-8 font-semibold">{t.common.create}</h2>
      <JsonForm L={L} url="/api/v1/admin/plans" submit={t.common.create} fields={[
        { name: "code", label: t.plans.code, dir: "ltr" }, { name: "nameAr", label: t.plans.nameAr }, { name: "nameEn", label: t.plans.nameEn },
        { name: "durationDays", label: t.plans.duration, type: "number" }, { name: "priceIqd", label: t.plans.price, type: "number" },
      ]} />
    </AdminShell>
  );
}
