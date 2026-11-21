import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/session";
import { canUseExams } from "@/server/exams/access";
import { listLogos, listTemplates } from "@/server/exams/templates";
import { getLocale } from "@/lib/i18n/server";
import { templateDicts } from "@/lib/i18n/templates";
import { FONTS, HEADER_KEYS, HIDDEN_BY_DEFAULT, LABELS } from "@/lib/exam-render";
import { TemplatesManager } from "@/components/exams/TemplatesManager";

export const metadata = { title: "قوالب الورقة" };

export default async function Page() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!(await canUseExams(auth))) redirect("/exams");
  const locale = (await getLocale()) === "en" ? "en" : "ar";
  const [templates, logos] = await Promise.all([listTemplates(auth.user.id, locale), listLogos(auth.user.id)]);
  return (
    <TemplatesManager
      t={templateDicts[locale]} templates={templates} logos={logos.map((l) => l.id)} fonts={[...FONTS]}
      fields={HEADER_KEYS.map((k) => ({ key: k, label: LABELS[locale][k], hidden: HIDDEN_BY_DEFAULT.includes(k), auto: ["title", "subject", "grade", "examKind", "time", "total", "model"].includes(k) }))}
      lang={locale}
    />
  );
}
