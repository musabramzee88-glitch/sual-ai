import { CurriculumPicker, type PickerText } from "@/components/CurriculumPicker";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { ExamPaperPreview } from "@/components/ExamPaperPreview";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getDictionary } from "@/lib/i18n/server";
import { listStages, listTracks } from "@/server/curriculum";
import { db } from "@/server/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { t, locale } = await getDictionary();
  const [stages, tracks, plans] = await Promise.all([
    listStages(),
    listTracks(),
    db.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const name = (i: { nameAr: string; nameEn: string }) => (locale === "ar" ? i.nameAr : i.nameEn);
  const fmt = new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US");

  return (
    <>
      <SiteHeader t={t} locale={locale} />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="grid-paper absolute inset-0 -z-10 opacity-60" aria-hidden />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-[1.15fr_1fr] md:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-brand-strong">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden />{t.hero.badge}
              </span>
              <h1 className="mt-5 text-4xl font-bold leading-[1.25] tracking-tight text-balance md:text-5xl">{t.hero.title}</h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-muted">{t.hero.subtitle}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className="rounded-xl bg-brand px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-strong dark:text-paper">{t.hero.cta}</Link>
                <a href="#curricula" className="rounded-xl border border-line bg-surface px-6 py-3 font-semibold transition hover:border-brand">{t.hero.secondary}</a>
              </div>
              <p className="mt-5 text-sm text-muted">{t.hero.note}</p>
            </div>
            <ExamPaperPreview t={t.paper} />
          </div>
        </section>

        {/* Curricula */}
        <section id="curricula" className="border-y border-line bg-surface py-20">
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle title={t.curricula.title} subtitle={t.curricula.subtitle} />
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {tracks.map((tr, i) => (
                <article key={tr.code} className="rounded-2xl border border-line bg-paper p-6">
                  <span className={`inline-block rounded-lg px-2.5 py-1 text-xs font-bold ${i === 1 ? "bg-accent-soft text-accent-strong" : "bg-brand-soft text-brand-strong"}`}>{tr.code === "INTERNATIONAL" ? "AR · EN" : "AR"}</span>
                  <h3 className="mt-3 text-xl font-bold">{name(tr)}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted">{locale === "ar" ? tr.descriptionAr : tr.descriptionEn}</p>
                </article>
              ))}
            </div>
            <div className="mt-6 grid gap-6 rounded-2xl border border-line bg-paper p-6 md:grid-cols-[1fr_2fr] md:p-8">
              <div>
                <h3 className="text-lg font-bold">{t.curricula.tryTitle}</h3>
                <ul className="mt-4 space-y-2 text-sm">
                  {stages.map((s) => (
                    <li key={s.code} className="flex justify-between gap-4 border-b border-line pb-2">
                      <span>{name(s)}</span><span className="text-muted">{t.curricula.gradesCount(s._count.grades)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <CurriculumPicker t={pickerText(t.curricula)} locale={locale} stages={stages} tracks={tracks} />
            </div>
          </div>
        </section>

        {/* How */}
        <section id="how" className="py-20">
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle title={t.how.title} />
            <ol className="mt-10 grid gap-4 md:grid-cols-4">
              {t.how.steps.map(([title, body], i) => (
                <li key={title} className="relative rounded-2xl border border-line bg-surface p-6">
                  <span className="grid size-9 place-items-center rounded-full bg-ink text-sm font-bold text-paper">{fmt.format(i + 1)}</span>
                  <h3 className="mt-4 font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="bg-ink py-20 text-paper">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-3xl font-bold">{t.features.title}</h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl bg-paper/15 sm:grid-cols-2 lg:grid-cols-3">
              {t.features.items.map(([title, body]) => (
                <div key={title} className="bg-ink p-6">
                  <span className="block h-1 w-8 rounded bg-accent" aria-hidden />
                  <h3 className="mt-4 font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-7 text-paper/70">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing — من قاعدة البيانات فقط، لا أسعار وهمية */}
        <section id="pricing" className="py-20">
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle title={t.pricing.title} subtitle={t.pricing.subtitle} />
            {plans.length === 0 ? (
              <p className="mt-10 rounded-2xl border border-dashed border-line p-10 text-center text-muted">{t.pricing.empty}</p>
            ) : (
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {plans.map((p) => (
                  <article key={p.id} className="rounded-2xl border border-line bg-surface p-6">
                    <h3 className="font-bold">{name(p)}</h3>
                    <p className="mt-4 text-3xl font-bold">{fmt.format(p.priceIqd)} <span className="text-base font-medium text-muted">{t.pricing.iqd}</span></p>
                    <p className="mt-1 text-sm text-muted">{t.pricing.perDays(p.durationDays)}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <SiteFooter t={t} locale={locale} />
    </>
  );
}

function pickerText(c: Dictionary["curricula"]): PickerText {
  const { stage, grade, track, branch, choose, none, loading, error } = c;
  return { stage, grade, track, branch, choose, none, loading, error };
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-3 leading-8 text-muted">{subtitle}</p>}
    </div>
  );
}
