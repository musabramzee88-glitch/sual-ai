import "server-only";
import { requirePaid } from "../auth/route";
import { getAuth, type AuthContext } from "../auth/session";
import { can, loadAdmin } from "../admin/guard";

/**
 * حارس خدمات الامتحانات: اشتراك فعّال (resolveAccess عبر requirePaid)، أو مدير فعّال بصلاحية المناهج
 * (لتجربة التوليد على الكتب قبل الإطلاق). يُطبَّق على الخادم في كل مسار امتحانات.
 */
export async function requireExamAccess(): Promise<{ auth: AuthContext } | { res: Response }> {
  const paid = await requirePaid();
  if (!("res" in paid)) return paid;
  const auth = await getAuth();
  const admin = await loadAdmin(auth);
  if (auth && admin && can(admin, "MANAGE_CURRICULUM")) return { auth };
  return paid;
}

/** للصفحات: هل يستطيع صاحب الجلسة استعمال الامتحانات؟ */
export async function canUseExams(auth: AuthContext): Promise<boolean> {
  if (auth.access === "SUBSCRIPTION_ACTIVE") return true;
  const admin = await loadAdmin(auth);
  return !!admin && can(admin, "MANAGE_CURRICULUM");
}
