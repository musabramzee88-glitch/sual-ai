import Link from "next/link";
import { setLocale } from "@/app/actions";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { Logo } from "./Logo";

export function SiteHeader({ t, locale }: { t: Dictionary; locale: Locale }) {
  const links = [
    ["#features", t.nav.features],
    ["#curricula", t.nav.curricula],
    ["#how", t.nav.how],
    ["#pricing", t.nav.pricing],
  ] as const;
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="text-ink"><Logo label={t.brand} /></Link>
        <nav className="hidden flex-1 items-center gap-6 text-sm text-muted md:flex">
          {links.map(([href, label]) => (
            <a key={href} href={href} className="transition hover:text-ink">{label}</a>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2 md:ms-0">
          <form action={setLocale}>
            <input type="hidden" name="locale" value={locale === "ar" ? "en" : "ar"} />
            <button className="rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-surface hover:text-ink">{t.langSwitch}</button>
          </form>
          <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-surface sm:inline-block">{t.nav.login}</Link>
          <Link href="/register" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong dark:text-paper">{t.nav.register}</Link>
        </div>
      </div>
    </header>
  );
}
