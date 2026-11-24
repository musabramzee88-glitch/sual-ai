import "server-only";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "../env";
import { getMailer } from "../auth/mailer";
import { systemStatus } from "./status";
import { planAlerts, type AlertState } from "./alerts";

/**
 * فحص واحد: يقيس حالة النظام ويرسل إلى ALERT_EMAIL ما تغيّر (planAlerts يقرر).
 * الحالة في STORAGE_DIR/alert-state.json؛ إن فشل الإرسال لا تُحفظ فيُعاد في الفحص التالي.
 */
export async function runAlerts(now = new Date()) {
  if (!env.ALERT_EMAIL) return { sent: false, reason: "NO_ALERT_EMAIL" as const };
  const file = path.join(path.resolve(env.STORAGE_DIR), "alert-state.json");
  const prev = await readFile(file, "utf8").then((s) => JSON.parse(s) as AlertState).catch(() => ({}) as AlertState);
  const status = await systemStatus();
  const plan = planAlerts(status.checks, prev, now, { site: env.APP_URL });
  if (plan.mail) await getMailer().send({ to: env.ALERT_EMAIL, ...plan.mail });
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(plan.next, null, 2));
  return { sent: !!plan.mail, overall: status.overall };
}
