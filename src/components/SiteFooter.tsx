import Link from "next/link";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { LEGAL_LINKS } from "@/lib/i18n/legal";
import { Logo } from "./Logo";

export function SiteFooter({ t, locale }: { t: Dictionary; locale: Locale }) {
  const L = LEGAL_LINKS[locale];
  return (
    <footer className="border-t border-line py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 text-sm text-muted md:flex-row md:items-center md:justify-between">
        <Logo label={t.brand} />
        <p>{t.footer.disclaimer}</p>
        <nav className="flex gap-4">
          <Link href="/terms" className="hover:text-ink">{L.terms}</Link>
          <Link href="/privacy" className="hover:text-ink">{L.privacy}</Link>
          <Link href="/contact" className="hover:text-ink">{L.contact}</Link>
        </nav>
        <p>© {new Date().getFullYear()} {t.brand}. {t.footer.rights}</p>
      </div>
    </footer>
  );
}
