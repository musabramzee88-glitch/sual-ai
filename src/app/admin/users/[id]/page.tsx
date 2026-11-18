import { notFound } from "next/navigation";
import { Act } from "@/components/AdminActions";
import { AdminShell, Pill, TableWrap, Td, Th } from "@/components/AdminShell";
import { fmtDate, fmtDateTime, fmtIqd } from "@/lib/i18n/admin";
import { adminCtx } from "@/server/admin/page";
import { getUserDetail } from "@/server/admin/service";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { admin, site, t, L, pick } = await adminCtx("MANAGE_USERS");
  const u = await getUserDetail(id);
  if (!u) notFound();
  const canSubs = admin.permissions.has("MANAGE_SUBSCRIPTIONS");
  const isSelf = u.id === admin.auth.user.id;
  const row = (k: string, v: React.ReactNode) => <div className="flex gap-2 py-1 text-sm"><span className="w-40 text-muted">{k}</span><span>{v}</span></div>;
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={u.fullName}>
      <section className="rounded-xl border border-line bg-surface p-4">
        {row(t.common.email, <><span dir="ltr">{u.email}</span> · {u.emailVerifiedAt ? t.users.verified : t.users.notVerified}</>)}
        {row(t.common.phone, <><span dir="ltr">{u.phone}</span> · {u.phoneVerifiedAt ? t.users.verified : t.users.notVerified}</>)}
        {row(t.common.status, <Pill>{t.statuses[u.status]}</Pill>)}
        {u.teacherProfile && <>
          {row(t.users.specialization, u.teacherProfile.specialization)}
          {row(t.users.directorate, `${pick(u.teacherProfile.directorate as never)}`)}
          {row(t.users.school, u.teacherProfile.schools.map((s) => s.name).join("، "))}
        </>}
        {row(t.users.lastLogin, u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "—")}
        {row(t.common.date, fmtDate(u.createdAt))}
        {!isSelf && (
          <div className="mt-3 flex flex-wrap gap-2">
            {u.status !== "SUSPENDED" && <Act L={L} url={`/api/v1/admin/users/${u.id}/status`} body={{ status: "SUSPENDED" }} label={t.act.suspend} confirmText />}
            {u.status !== "BANNED" && <Act L={L} url={`/api/v1/admin/users/${u.id}/status`} body={{ status: "BANNED" }} label={t.act.ban} tone="danger" confirmText />}
            {(u.status === "SUSPENDED" || u.status === "BANNED") && <Act L={L} url={`/api/v1/admin/users/${u.id}/status`} body={{ status: "ACTIVE" }} label={t.act.activate} tone="ok" confirmText />}
            {!u.phoneVerifiedAt && <Act L={L} url={`/api/v1/admin/users/${u.id}/verify-phone`} label={t.act.verifyPhone} ask={{ field: "reason", label: t.act.verifyReason }} />}
          </div>
        )}
        {!u.phoneVerifiedAt && <p className="mt-2 text-xs text-muted">{t.users.manualWarn}</p>}
      </section>

      <h2 className="mb-2 mt-6 font-semibold">{t.users.subs}</h2>
      <TableWrap>
        <thead><tr><Th>{t.common.plan}</Th><Th>{t.common.status}</Th><Th>{t.common.starts}</Th><Th>{t.common.ends}</Th>{canSubs && <Th>{t.common.actions}</Th>}</tr></thead>
        <tbody>
          {u.subscriptions.length === 0 && <tr><Td>{t.common.empty}</Td></tr>}
          {u.subscriptions.map((s) => (
            <tr key={s.id}>
              <Td>{pick(s.plan)}</Td><Td><Pill>{t.statuses[s.status]}</Pill></Td><Td>{fmtDate(s.startsAt)}</Td><Td>{fmtDate(s.endsAt)}</Td>
              {canSubs && <Td><div className="flex flex-wrap gap-1">
                {s.status === "ACTIVE" && <Act L={L} url={`/api/v1/admin/subscriptions/${s.id}`} body={{ action: "extend" }} label={t.act.extend} ask={{ field: "days", label: t.act.extendDays, number: true }} />}
                {s.status === "ACTIVE" && <Act L={L} url={`/api/v1/admin/subscriptions/${s.id}`} body={{ action: "suspend" }} label={t.act.suspend} confirmText />}
                {s.status === "SUSPENDED" && <Act L={L} url={`/api/v1/admin/subscriptions/${s.id}`} body={{ action: "resume" }} label={t.act.resume} confirmText />}
                {["ACTIVE", "SUSPENDED", "PENDING_APPROVAL", "PENDING_PAYMENT"].includes(s.status) && <Act L={L} url={`/api/v1/admin/subscriptions/${s.id}`} body={{ action: "cancel" }} label={t.act.cancel} tone="danger" confirmText />}
              </div></Td>}
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <h2 className="mb-2 mt-6 font-semibold">{t.users.payments}</h2>
      <TableWrap>
        <thead><tr><Th>{t.common.ref}</Th><Th>{t.common.method}</Th><Th>{t.common.amount}</Th><Th>{t.common.status}</Th><Th>{t.common.date}</Th></tr></thead>
        <tbody>
          {u.transactions.length === 0 && <tr><Td>{t.common.empty}</Td></tr>}
          {u.transactions.map((x) => <tr key={x.id}><Td><span dir="ltr">{x.reference}</span></Td><Td>{t.statuses[x.method]}</Td><Td>{fmtIqd(x.amountIqd, t)}</Td><Td><Pill>{t.statuses[x.status]}</Pill></Td><Td>{fmtDate(x.createdAt)}</Td></tr>)}
        </tbody>
      </TableWrap>
    </AdminShell>
  );
}
