import { AuthShell } from "@/components/AuthShell";
import { ForgotForm } from "@/components/AuthForms";
import { getDictionary } from "@/lib/i18n/server";

export default async function Page() {
  const { t } = await getDictionary();
  return <AuthShell brand={t.brand} title={t.auth.forgotTitle}><ForgotForm t={t.auth} /></AuthShell>;
}
