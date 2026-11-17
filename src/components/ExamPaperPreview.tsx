import type { Dictionary } from "@/lib/i18n/dictionaries";

/** معاينة تصميمية ثابتة لورقة امتحان — مُعلَّمة بوضوح كمثال توضيحي. */
export function ExamPaperPreview({ t }: { t: Dictionary["paper"] }) {
  return (
    <figure className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-4 -z-10 rotate-2 rounded-3xl bg-accent-soft" aria-hidden />
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_20px_50px_-20px_rgba(16,42,58,0.35)]">
        <div className="grid grid-cols-3 items-start gap-2 border-b-2 border-ink/80 pb-3 text-[11px] leading-5">
          <div>
            <p className="font-semibold">{t.republic}</p>
            <p>{t.ministry}</p>
            <p className="text-muted">{t.directorate}</p>
          </div>
          <div className="flex justify-center">
            <span className="grid size-11 place-items-center rounded-full border-2 border-dashed border-line text-[10px] text-muted">LOGO</span>
          </div>
          <div className="text-end">
            <p>{t.subject}</p>
            <p>{t.grade}</p>
            <p>{t.time}</p>
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand-strong">{t.model}</span>
        </div>
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold">{t.q1}</p>
            <span className="shrink-0 text-xs text-muted">{t.marks}</span>
          </div>
          <p className="ps-4">{t.q1a[0]} <span dir="ltr" className="inline-block font-mono text-[13px] [unicode-bidi:isolate]">{t.q1a[1]}</span></p>
          <p className="ps-4">{t.q1b[0]} <span dir="ltr" className="inline-block font-mono text-[13px] [unicode-bidi:isolate]">{t.q1b[1]}</span></p>
          <p className="font-semibold">{t.q2}</p>
          <div className="space-y-2 ps-4" aria-hidden>
            <div className="h-2 w-11/12 rounded bg-line" />
            <div className="h-2 w-8/12 rounded bg-line" />
            <div className="h-2 w-10/12 rounded bg-line" />
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted">{t.sample}</figcaption>
    </figure>
  );
}
