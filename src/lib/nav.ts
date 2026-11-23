/** مسارات التنقل والتبويب النشط (دوال نقية مُختبَرة؛ يستعملها شريط التنقل) */
export type NavKey = "home" | "exams" | "newExam" | "templates" | "subscribe" | "account" | "admin";
export const HREF: Record<NavKey, string> = { home: "/dashboard", exams: "/exams", newExam: "/exams/new", templates: "/exams/templates", subscribe: "/subscribe", account: "/settings/security", admin: "/admin" };

/** أي تبويب نشط لمسار ما (امتحان مفتوح يتبع «امتحاناتي») */
export function activeTab(path: string): NavKey | null {
  if (path === "/dashboard") return "home";
  if (path === "/exams/new") return "newExam";
  if (path.startsWith("/exams/templates")) return "templates";
  if (path === "/exams" || path.startsWith("/exams/")) return "exams";
  if (path.startsWith("/subscribe")) return "subscribe";
  if (path.startsWith("/settings")) return "account";
  if (path.startsWith("/admin")) return "admin";
  return null;
}

