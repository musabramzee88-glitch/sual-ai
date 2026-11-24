import Link from "next/link";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { getDictionary } from "@/lib/i18n/server";
import { legalDoc, type LegalKind } from "@/lib/i18n/legal";
import { env } from "@/server/env";

/** تاريخ آخر تعديل جوهري على النصوص (يُحدَّث يدوياً مع كل تعديل في legal.ts) */
const UPDATED = "2026-11-24";

export async function LegalPage({ kind }: { kind: LegalKind }) {
  const { t, locale } = await getDictionary();
  const doc = legalDoc(kind, locale, { email: env.SUPPORT_EMAIL ?? null, whatsapp: env.SUPPORT_WHATSAPP ?? null, refundDays: env.REFUND_DAYS, updated: UPDATED });
  return (
    <>
      <SiteHeader t={t} locale={locale} />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-3 leading-8 text-muted">{doc.intro}</p>
        <div className="mt-8 space-y-8">
          {doc.blocks.map((b) => (
            <section key={b.h}>
              <h2 className="mb-3 text-lg font-bold">{b.h}</h2>
              {b.p?.map((p) => <p key={p} className="mb-2 leading-8">{p}</p>)}
              {b.list && <ul className="list-disc space-y-1.5 ps-6 leading-8">{b.list.map((li) => <li key={li}>{li}</li>)}</ul>}
            </section>
          ))}
        </div>
        <p className="mt-12 text-sm"><Link href="/" className="text-brand">{t.brand}</Link></p>
      </main>
      <SiteFooter t={t} locale={locale} />
    </>
  );
}
