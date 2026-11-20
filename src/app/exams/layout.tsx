import Link from "next/link";
import { Logo } from "@/components/Logo";
import { getDictionary } from "@/lib/i18n/server";

export default async function ExamsLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getDictionary();
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 print:max-w-none print:p-0">
      <div className="mb-5 flex items-center justify-between print:hidden">
        <Link href="/" className="text-ink"><Logo label={t.brand} /></Link>
        <Link href="/dashboard" className="text-sm text-muted">{t.dashboard.title}</Link>
      </div>
      {children}
    </main>
  );
}
