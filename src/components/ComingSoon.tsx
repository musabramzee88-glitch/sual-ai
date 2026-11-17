import Link from "next/link";
import { getDictionary } from "@/lib/i18n/server";
import { Logo } from "./Logo";

export async function ComingSoon() {
  const { t } = await getDictionary();
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <Logo label={t.brand} />
        <h1 className="mt-6 text-2xl font-bold">{t.soon.title}</h1>
        <p className="mt-3 text-muted">{t.soon.body}</p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-brand px-5 py-2.5 font-semibold text-white dark:text-paper">{t.soon.back}</Link>
      </div>
    </main>
  );
}
