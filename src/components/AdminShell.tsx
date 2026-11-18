import Link from "next/link";
import type { AdminPermission } from "@prisma/client";
import { Logo } from "./Logo";
import type { AdminDict } from "@/lib/i18n/admin";

const items: [string, keyof AdminDict["nav"], AdminPermission][] = [
  ["/admin", "home", "VIEW_DASHBOARD"], ["/admin/users", "users", "MANAGE_USERS"], ["/admin/requests", "requests", "APPROVE_PAYMENTS"],
  ["/admin/subscriptions", "subscriptions", "MANAGE_SUBSCRIPTIONS"], ["/admin/payments", "payments", "APPROVE_PAYMENTS"], ["/admin/plans", "plans", "MANAGE_PLANS"],
  ["/admin/staff", "staff", "MANAGE_STAFF"], ["/admin/messages", "messages", "MANAGE_SYSTEM_MESSAGES"], ["/admin/audit", "audit", "VIEW_AUDIT_LOG"],
];

export function AdminShell({ brand, t, perms, title, children }: { brand: string; t: AdminDict; perms: Set<AdminPermission>; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center gap-4 border-b border-line pb-4">
        <Link href="/" className="text-ink"><Logo label={brand} /></Link>
        <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">{t.panel}</span>
        <Link href="/dashboard" className="ms-auto text-sm text-muted hover:text-ink">{t.back}</Link>
      </header>
      <div className="grid gap-6 md:grid-cols-[13rem_1fr]">
        <nav className="flex flex-wrap gap-1 md:flex-col">
          {items.filter(([, , p]) => perms.has(p)).map(([href, k]) => (
            <Link key={href} href={href} className="rounded-lg px-3 py-2 text-sm hover:bg-surface">{t.nav[k]}</Link>
          ))}
        </nav>
        <main className="min-w-0">
          <h1 className="mb-4 text-2xl font-bold">{title}</h1>
          {children}
        </main>
      </div>
    </div>
  );
}

export const tableCls = "w-full min-w-[40rem] text-sm";
export const Th = ({ children }: { children?: React.ReactNode }) => <th className="border-b border-line px-3 py-2 text-start font-semibold text-muted">{children}</th>;
export const Td = ({ children, className = "" }: { children?: React.ReactNode; className?: string }) => <td className={`border-b border-line/60 px-3 py-2 align-top ${className}`}>{children}</td>;
export const TableWrap = ({ children }: { children: React.ReactNode }) => <div className="overflow-x-auto rounded-xl border border-line bg-surface"><table className={tableCls}>{children}</table></div>;
export const Pill = ({ children }: { children: React.ReactNode }) => <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs">{children}</span>;
