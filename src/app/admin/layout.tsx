import { redirect } from "next/navigation";
import { loadAdmin } from "@/server/admin/guard";
import { getAuth } from "@/server/auth/session";

export const metadata = { title: "الإدارة", robots: { index: false } };
export const dynamic = "force-dynamic";

/** أول حاجز: لا يدخل إلا إداري فعّال. كل صفحة تتحقق من صلاحيتها المحددة أيضاً على الخادم. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!(await loadAdmin(auth))) redirect("/dashboard");
  return children;
}
