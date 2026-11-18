import Link from "next/link";
import { Act } from "@/components/AdminActions";
import { AdminShell, Pill, TableWrap, Td, Th } from "@/components/AdminShell";
import { fmtDateTime, fmtIqd } from "@/lib/i18n/admin";
import { adminCtx } from "@/server/admin/page";
import { listPaymentRequests } from "@/server/admin/service";

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { admin, site, t, L, pick } = await adminCtx("APPROVE_PAYMENTS");
  const rows = await listPaymentRequests(status);
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={t.requests.title}>
      <div className="mb-4 flex gap-3 text-sm">
        <Link href="/admin/requests?status=PENDING_REVIEW" className="text-brand">{t.requests.pendingOnly}</Link>
        <Link href="/admin/requests" className="text-brand">{t.common.all}</Link>
      </div>
      <TableWrap>
        <thead><tr><Th>{t.common.ref}</Th><Th>{t.common.user}</Th><Th>{t.common.plan}</Th><Th>{t.common.amount}</Th><Th>{t.common.status}</Th><Th>{t.common.date}</Th><Th>{t.common.actions}</Th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><Td>{t.common.empty}</Td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <Td><span dir="ltr">{r.reference}</span></Td>
              <Td><Link href={`/admin/users/${r.user.id}`} className="text-brand">{r.user.fullName}</Link><div className="text-xs text-muted" dir="ltr">{r.user.phone}</div>{r.userNote && <div className="mt-1 text-xs">{t.requests.userNote}: {r.userNote}</div>}</Td>
              <Td>{pick(r.plan)} · {r.plan.durationDays} {t.common.days}</Td>
              <Td>{fmtIqd(r.amountIqd, t)}</Td>
              <Td><Pill>{t.statuses[r.status]}</Pill>{r.reviewedBy && <div className="text-xs text-muted">{r.reviewedBy.user.fullName}</div>}{r.reviewNote && <div className="text-xs">{r.reviewNote}</div>}</Td>
              <Td>{fmtDateTime(r.createdAt)}</Td>
              <Td>{r.status === "PENDING_REVIEW" && <div className="flex gap-1">
                <Act L={L} url={`/api/v1/admin/payment-requests/${r.id}/approve`} label={t.act.approve} tone="ok" confirmText />
                <Act L={L} url={`/api/v1/admin/payment-requests/${r.id}/reject`} label={t.act.reject} tone="danger" ask={{ field: "note", label: t.act.rejectReason }} />
              </div>}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </AdminShell>
  );
}
