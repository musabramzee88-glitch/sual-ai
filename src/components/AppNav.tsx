"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavDict } from "@/lib/i18n/nav";

/**
 * تنقل المدرس: شريط علوي على الشاشات الواسعة، وشريط سفلي ثابت على الهاتف (خمسة أزرار بأيقونات) مثل التطبيقات.
 * الصفحة الحالية مبرزة (aria-current). لا يُطبع.
 */
import { HREF, activeTab, type NavKey as Key } from "@/lib/nav";

const ICONS: Record<Key, React.ReactNode> = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h5v-5h3v5h5V10" />,
  exams: <path d="M7 4h10a1 1 0 0 1 1 1v15H6V5a1 1 0 0 1 1-1Zm2.5 5h5m-5 4h5m-5 4h3" />,
  newExam: <path d="M12 5v14M5 12h14" />,
  templates: <path d="M4 5h16v4H4zM4 12h7v7H4zM14 12h6v7h-6z" />,
  subscribe: <path d="M4 7h16v11H4zM4 11h16" />,
  account: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />,
  admin: <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z" />,
};
const Icon = ({ k, className }: { k: Key; className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{ICONS[k]}</svg>
);

export function AppNav({ t, isAdmin, canExams }: { t: NavDict; isAdmin: boolean; canExams: boolean }) {
  const active = activeTab(usePathname() ?? "");
  const top: Key[] = ["home", ...(canExams ? (["exams", "newExam", "templates"] as Key[]) : []), "subscribe", "account", ...(isAdmin ? (["admin"] as Key[]) : [])];
  const bottom: Key[] = canExams ? ["home", "exams", "newExam", "templates", "account"] : ["home", "subscribe", "account", ...(isAdmin ? (["admin"] as Key[]) : [])];
  const label = (k: Key, short = false) => (k === "newExam" && short ? t.newShort : t[k]);
  return (
    <>
      <nav aria-label={t.main} className="hidden flex-wrap items-center gap-1 md:flex print:hidden">
        {top.map((k) => (
          <Link key={k} href={HREF[k]} aria-current={active === k ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${active === k ? "bg-brand-soft font-semibold text-brand" : "text-muted hover:bg-surface hover:text-ink"}`}>
            <Icon k={k} className="h-4 w-4" />{label(k)}
          </Link>
        ))}
      </nav>
      <nav aria-label={t.main} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden">
        <ul className="mx-auto flex max-w-lg justify-around">
          {bottom.map((k) => (
            <li key={k} className="flex-1">
              <Link href={HREF[k]} aria-current={active === k ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active === k ? "font-semibold text-brand" : "text-muted"}`}>
                <span className={k === "newExam" ? "grid h-8 w-8 place-items-center rounded-full bg-brand text-white dark:text-paper" : ""}><Icon k={k} className={k === "newExam" ? "h-5 w-5" : "h-6 w-6"} /></span>
                {label(k, true)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

/** تبويبا الامتحان المفتوح: الأسئلة والتعديل ↔ الورقة والتنزيل (في الصفحة نفسها، لا تبويب متصفح جديد) */
export function ExamTabs({ examId, t }: { examId: string; t: NavDict }) {
  const path = usePathname() ?? "";
  const onSheet = path.endsWith("/print");
  const tab = (href: string, on: boolean, text: string) => (
    <Link href={href} aria-current={on ? "page" : undefined} className={`flex-1 rounded-lg px-3 py-2 text-center text-sm sm:flex-none ${on ? "bg-brand font-semibold text-white dark:text-paper" : "text-muted hover:text-ink"}`}>{text}</Link>
  );
  return (
    <nav aria-label={t.examNav} className="flex gap-1 rounded-xl border border-line bg-surface p-1 print:hidden">
      {tab(`/exams/${examId}`, !onSheet, t.examQuestions)}
      {tab(`/exams/${examId}/print`, onSheet, t.examSheet)}
    </nav>
  );
}
