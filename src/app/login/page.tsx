import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "@/components/AuthForms";
import { getDictionary } from "@/lib/i18n/server";
import { getAuth } from "@/server/auth/session";

export const metadata = { title: "تسجيل الدخول" };

export default async function Page() {
  if (await getAuth()) redirect("/dashboard");
  const { t } = await getDictionary();
  return <AuthShell brand={t.brand} title={t.auth.loginTitle}><LoginForm t={t.auth} /></AuthShell>;
}
