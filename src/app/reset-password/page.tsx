import { AuthShell } from "@/components/AuthShell";
import { ResetForm } from "@/components/AuthForms";
import { getDictionary } from "@/lib/i18n/server";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const { t } = await getDictionary();
  return (
    <AuthShell brand={t.brand} title={t.auth.resetTitle}>
      {token ? <ResetForm t={t.auth} token={token} /> : <p className="text-sm text-danger">{t.auth.errors.INVALID_TOKEN}</p>}
    </AuthShell>
  );
}
