import Link from "next/link";
import { redirect } from "next/navigation";
import { ShellCard, TeacherShell } from "@/components/TeacherShell";
import { CancelRequestButton, CashRequestForm } from "@/components/SubscribeClient";
import { getDictionary } from "@/lib/i18n/server";
import { getMessage } from "@/server/admin/service";
import { getAuth } from "@/server/auth/session";
import { getMySubscriptionState, listActivePlans } from "@/server/billing/service";

export const metadata = { title: "الاشتراك" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const { t, locale } = await getDictionary();
  const s = t.subscribe;
  const [plans, state, msg] = await Promise.all([
    listActivePlans(), getMySubscriptionState(auth.user.id), getMessage("cash_payment_instructions", locale === "ar" ? "AR" : "EN"),
  ]);
  const active = state.current?.status === "ACTIVE" && state.current.endsAt && state.current.endsAt > new Date() ? state.current : null;
  const blocked = auth.access === "BANNED" || auth.access === "ACCOUNT_SUSPENDED";
  return (
    <TeacherShell narrow><ShellCard title={s.title}>
      <div className="space-y-6">
        {active && (
          <div className="rounded-xl bg-brand-soft p-4 text-sm">
            <div className="font-semibold">{s.current}: {locale === "ar" ? active.plan.nameAr : active.plan.nameEn}</div>
            <div>{s.ends}: <span dir="ltr">{active.endsAt!.toLocaleDateString("en-GB")}</span></div>
          </div>
        )}

        {state.pending ? (
          <div className="space-y-3">
            <h2 className="font-semibold">{s.pendingTitle}</h2>
            <p className="text-sm">{s.ref}: <strong dir="ltr">{state.pending.reference}</strong> · {(locale === "ar" ? state.pending.plan.nameAr : state.pending.plan.nameEn)} · <span dir="ltr">{state.pending.amountIqd.toLocaleString("en-US")} {s.iqd}</span></p>
            <CancelRequestButton t={s} />
          </div>
        ) : blocked ? null : !(auth.user.emailVerified || auth.user.phoneVerified) ? (
          <p className="text-sm text-danger">{s.needEmail}</p>
        ) : plans.length === 0 ? (
          <p className="text-sm text-muted">{s.noPlans}</p>
        ) : (
          <>
            <p className="text-sm text-muted">{s.cashFlow}</p>
            <section>
              <h2 className="mb-1 font-semibold">{s.instructions}</h2>
              {msg ? <div className="whitespace-pre-wrap rounded-xl border border-line p-3 text-sm"><div className="font-semibold">{msg.title}</div>{msg.body}</div> : <p className="text-sm text-muted">{s.noInstructions}</p>}
            </section>
            <CashRequestForm t={s} plans={plans.map((p) => ({ id: p.id, name: locale === "ar" ? p.nameAr : p.nameEn, durationDays: p.durationDays, priceIqd: p.priceIqd }))} />
          </>
        )}
        <Link href="/dashboard" className="inline-block text-sm text-brand">{s.back}</Link>
      </div>
    </ShellCard></TeacherShell>
  );
}
