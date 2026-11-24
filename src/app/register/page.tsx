import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "@/components/AuthForms";
import Link from "next/link";
import { getDictionary } from "@/lib/i18n/server";
import { LEGAL_LINKS } from "@/lib/i18n/legal";
import { getAuth } from "@/server/auth/session";

export const metadata = { title: "إنشاء حساب" };

export default async function Page() {
  if (await getAuth()) redirect("/dashboard");
  const { t, locale } = await getDictionary();
  const L = LEGAL_LINKS[locale];
  return (
    <AuthShell brand={t.brand} title={t.auth.registerTitle}>
      <RegisterForm t={t.auth} locale={locale} />
      <p className="mt-4 text-center text-xs leading-6 text-muted">
        {L.agree} <Link href="/terms" className="text-brand underline">{L.terms}</Link> {locale === "ar" ? "و" : "and"} <Link href="/privacy" className="text-brand underline">{L.privacy}</Link>.
      </p>
    </AuthShell>
  );
}
