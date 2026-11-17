import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "@/components/AuthForms";
import { getDictionary } from "@/lib/i18n/server";
import { getAuth } from "@/server/auth/session";

export const metadata = { title: "إنشاء حساب" };

export default async function Page() {
  if (await getAuth()) redirect("/dashboard");
  const { t, locale } = await getDictionary();
  return <AuthShell brand={t.brand} title={t.auth.registerTitle}><RegisterForm t={t.auth} locale={locale} /></AuthShell>;
}
