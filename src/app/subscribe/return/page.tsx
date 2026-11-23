import Link from "next/link";
import { redirect } from "next/navigation";
import { ShellCard, TeacherShell } from "@/components/TeacherShell";
import { AutoRefresh } from "@/components/SubscribeClient";
import { getDictionary } from "@/lib/i18n/server";
import { getAuth } from "@/server/auth/session";
import { cardStatus } from "@/server/billing/card";

export const metadata = { title: "نتيجة الدفع" };
export const dynamic = "force-dynamic";

/** صفحة العودة من البوابة: تعرض الحالة فقط (التفعيل يتم من إشعار البوابة الموقّع، لا من هنا) */
export default async function Page({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const { t, locale } = await getDictionary();
  const c = t.subscribe.card;
  const ref = ((await searchParams).ref ?? "").slice(0, 40);
  const st = ref ? await cardStatus(auth.user.id, ref) : null;
  return (
    <TeacherShell narrow><ShellCard title={c.returnTitle}>
      {!st ? <p className="text-sm text-muted">{c.notFound}</p> : (
        <div className="space-y-4">
          <p className={`rounded-xl p-4 text-sm font-semibold ${st.status === "SUCCEEDED" ? "bg-brand-soft text-brand" : st.status === "FAILED" ? "bg-accent-soft text-danger" : "bg-surface"}`} role="status">
            {c[st.status]}{st.status === "SUCCEEDED" && st.endsAt ? <> <span dir="ltr">{st.endsAt.toLocaleDateString("en-GB")}</span></> : null}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">{c.plan}</dt><dd>{locale === "ar" ? st.planAr : st.planEn}</dd>
            <dt className="text-muted">{c.amount}</dt><dd dir="ltr" className="text-end">{st.amountIqd.toLocaleString("en-US")} {t.subscribe.iqd}</dd>
            <dt className="text-muted">{c.ref}</dt><dd dir="ltr" className="text-end">{st.reference}</dd>
          </dl>
          {(st.status === "PENDING" || st.status === "INITIATED") && <AutoRefresh />}
          <div className="flex gap-2">
            {st.status === "SUCCEEDED" && <Link href="/exams" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-paper">{c.toExams}</Link>}
            {(st.status === "FAILED" || st.status === "CANCELLED") && <Link href="/subscribe" className="rounded-lg border border-line px-4 py-2 text-sm">{c.retry}</Link>}
          </div>
        </div>
      )}
    </ShellCard></TeacherShell>
  );
}
