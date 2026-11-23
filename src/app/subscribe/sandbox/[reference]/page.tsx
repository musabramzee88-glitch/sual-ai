import { notFound, redirect } from "next/navigation";
import { ShellCard, TeacherShell } from "@/components/TeacherShell";
import { SandboxActions } from "@/components/SubscribeClient";
import { getDictionary } from "@/lib/i18n/server";
import { getAuth } from "@/server/auth/session";
import { cardIsTest, cardStatus } from "@/server/billing/card";

export const metadata = { title: "بوابة الدفع التجريبية" };
export const dynamic = "force-dynamic";

/** صفحة البوابة التجريبية (فقط مع PAYMENT_PROVIDER=sandbox): لا دفع حقيقي، وتقول ذلك بوضوح */
export default async function Page({ params }: { params: Promise<{ reference: string }> }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!cardIsTest()) notFound();
  const ref = (await params).reference.slice(0, 40);
  const st = await cardStatus(auth.user.id, ref);
  if (!st || st.provider !== "sandbox") notFound();
  if (st.status !== "PENDING") redirect(`/subscribe/return?ref=${encodeURIComponent(ref)}`);
  const { t, locale } = await getDictionary();
  const c = t.subscribe.card;
  return (
    <TeacherShell narrow><ShellCard title={c.sandboxTitle}>
      <div className="space-y-4">
        <p className="rounded-lg border-2 border-dashed border-accent bg-accent-soft px-3 py-2 text-sm font-semibold">{c.testBanner}</p>
        <p className="text-sm text-muted">{c.sandboxHint}</p>
        <p className="text-sm">{locale === "ar" ? st.planAr : st.planEn} · <span dir="ltr">{st.amountIqd.toLocaleString("en-US")} {t.subscribe.iqd}</span> · <span dir="ltr">{st.reference}</span></p>
        <SandboxActions t={t.subscribe} reference={st.reference} />
      </div>
    </ShellCard></TeacherShell>
  );
}
