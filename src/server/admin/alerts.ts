/**
 * تنبيهات البريد عند الأعطال (دوال نقية مُختبَرة؛ لا قاعدة بيانات ولا بريد هنا).
 * المدخل: فحوص «حالة النظام» الحالية + حالة التنبيهات السابقة. المخرج: رسالة واحدة (أو لا شيء) والحالة الجديدة.
 * - يُرسَل عند ظهور مشكلة جديدة أو اشتداد مستواها (warn ← error).
 * - مشكلة مستمرة لا تُكرَّر إلا كل repeatHours (24 افتراضياً) حتى لا يمتلئ البريد.
 * - عند زوال مشكلة سبق التنبيه بها تُرسَل «عادت للعمل».
 * - الفحص الأول بعد تشغيل الخادم لا يُرسل «عادت للعمل» لما لا يعرف عنه.
 */
import type { Check, Level } from "./status-rules";

export type AlertState = Record<string, { level: Exclude<Level, "ok">; since: string; lastSent: string }>;
export type AlertPlan = { mail: { subject: string; text: string } | null; next: AlertState };

const LABELS: Record<string, string> = {
  db: "قاعدة البيانات", migrations: "تحديثات قاعدة البيانات", backup: "النسخ الاحتياطي", disk: "مساحة القرص", pdf: "محرّك PDF",
  ai: "الذكاء الاصطناعي", books: "الكتب", exports: "التنزيلات", fonts: "الخطوط العربية", offsite: "النسخة خارج الخادم",
};
const rank = { ok: 0, warn: 1, error: 2 } as const;

export function planAlerts(checks: Check[], prev: AlertState, now: Date, opts: { repeatHours?: number; site?: string } = {}): AlertPlan {
  const repeatMs = (opts.repeatHours ?? 24) * 3600 * 1000;
  const iso = now.toISOString();
  const next: AlertState = {};
  const fresh: Check[] = [], still: Check[] = [], recovered: string[] = [];
  for (const c of checks) {
    const p = prev[c.key];
    if (c.level === "ok") { if (p) recovered.push(c.key); continue; }
    if (!p || rank[c.level] > rank[p.level]) { fresh.push(c); next[c.key] = { level: c.level, since: p?.since ?? iso, lastSent: iso }; continue; }
    const due = now.getTime() - new Date(p.lastSent).getTime() >= repeatMs;
    if (due) still.push(c);
    next[c.key] = { level: c.level, since: p.since, lastSent: due ? iso : p.lastSent };
  }
  // مشكلة سابقة لم يعد فحصها موجوداً (فحص أُزيل) لا تبقى معلّقة
  if (!fresh.length && !still.length && !recovered.length) return { mail: null, next };

  const line = (c: Check) => `• ${LABELS[c.key] ?? c.key}: ${c.value}${c.hint ? `\n  ماذا تفعل: ${c.hint}` : ""}`;
  const parts: string[] = [];
  if (fresh.length) parts.push(`مشاكل جديدة:\n${fresh.map(line).join("\n")}`);
  if (still.length) parts.push(`ما زالت قائمة:\n${still.map(line).join("\n")}`);
  if (recovered.length) parts.push(`عادت للعمل:\n${recovered.map((k) => `• ${LABELS[k] ?? k}`).join("\n")}`);
  const worst = [...fresh, ...still].some((c) => c.level === "error") ? "عطل" : fresh.length || still.length ? "تنبيه" : "تم الإصلاح";
  const site = opts.site ? ` — ${opts.site}` : "";
  const subject = `[سُؤال AI] ${worst}: ${[...fresh, ...still].map((c) => LABELS[c.key] ?? c.key).join("، ") || recovered.map((k) => LABELS[k] ?? k).join("، ")}${site}`;
  const text = `${parts.join("\n\n")}\n\nالتفاصيل الكاملة في صفحة «حالة النظام» داخل لوحة الإدارة${opts.site ? `: ${opts.site}/admin/status` : "."}\nوقت الفحص: ${iso}`;
  return { mail: { subject: subject.slice(0, 200), text }, next };
}
