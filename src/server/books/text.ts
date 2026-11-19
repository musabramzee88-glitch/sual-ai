/**
 * تنظيف نص مستخرج من PDF عربي (دوال نقية قابلة للاختبار).
 * - NFKC يحوّل أشكال العرض العربية (ﻻ ﺍ ﺑ…) إلى الحروف الأصلية.
 * - بعض ملفات PDF تخزّن العربية بالترتيب المرئي (مقلوبة). نكتشف ذلك بكلمات شائعة
 *   ونقلب السطر فقط عند رجحان واضح، مع إعادة الأرقام واللاتيني لترتيبها.
 */
const COMMON = new Set([
  "في", "من", "على", "إلى", "الى", "عن", "أن", "ان", "ما", "لا", "هو", "هي", "التي", "الذي", "مع", "كل", "هذا", "هذه",
  "كان", "بين", "او", "أو", "ثم", "قد", "لم", "لن", "إذا", "اذا", "عند", "بعد", "قبل", "حتى", "الدرس", "الفصل", "تمرين", "مثال", "اكتب", "أكتب", "اجب", "أجب",
]);
const ARABIC = /[؀-ۿ]/;
const words = (s: string) => s.split(/[\s،,.:؛;!?؟()«»"'\-]+/).filter(Boolean);
const score = (s: string) => {
  let n = 0;
  for (const w of words(s)) if (COMMON.has(w) || (w.length > 3 && w.startsWith("ال"))) n++;
  return n;
};

/** يقلب الأحرف ثم يعيد تسلسلات الأرقام/اللاتيني إلى ترتيبها الطبيعي */
export function reverseVisual(line: string): string {
  const rev = [...line].reverse().join("");
  const run = "[A-Za-z0-9٠-٩.,%+\\-=/×÷^()[\\]]";
  // مقاطع لاتينية/رقمية (وعبارات لاتينية متعددة الكلمات) تعود لترتيبها الطبيعي
  return rev.replace(new RegExp(`${run}{2,}(?: ${run}+)*`, "g"), (m) => [...m].reverse().join(""));
}

export function fixArabicLine(line: string): string {
  if (!ARABIC.test(line)) return line;
  const normal = score(line);
  const reversed = score(reverseVisual(line));
  return reversed >= normal + 2 || (normal === 0 && reversed >= 1) ? reverseVisual(line) : line;
}

export function cleanPageText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/ـ/g, "") // تطويل
    .replace(/[​-‏‪-‮⁦-⁩]/g, "") // محارف اتجاه/صفرية العرض
    .split("\n")
    .map((l) => fixArabicLine(l.replace(/[ \t]+/g, " ").trim()))
    .filter((l) => l.length > 0)
    .join("\n");
}

/** هل في الصفحة نص حقيقي؟ (المصوّرة تعطي فراغاً أو رموزاً متناثرة) */
export const hasRealText = (t: string) => (t.match(/[\p{L}]/gu)?.length ?? 0) >= 40;

// ───────────── تجميع النص حسب موقعه في الصفحة ─────────────
// أشكال العرض العربية (من بيانات Unicode): «شكل نهاية» في أول الكلمة أو «شكل بداية» في آخرها
// يعني أن الكلمة مخزّنة مقلوبة (ترتيب مرئي). مولَّدة من unicodedata — لا تُعدَّل يدوياً.
const FINAL_FORMS = /^[\uFB51\uFB53\uFB57\uFB5B\uFB5F\uFB63\uFB67\uFB6B\uFB6F\uFB73\uFB77\uFB7B\uFB7F\uFB83\uFB85\uFB87\uFB89\uFB8B\uFB8D\uFB8F\uFB93\uFB97\uFB9B\uFB9F\uFBA1\uFBA5\uFBA7\uFBAB\uFBAF\uFBB1\uFBD4\uFBD8\uFBDA\uFBDC\uFBDF\uFBE1\uFBE3\uFBE5\uFBEB\uFBED\uFBEF\uFBF1\uFBF3\uFBF5\uFBF7\uFBFA\uFBFD\uFC64-\uFC96\uFD11-\uFD2C\uFD3C\uFD51\uFD58\uFD5A-\uFD5B\uFD5E-\uFD5F\uFD62\uFD64\uFD66-\uFD67\uFD69-\uFD6A\uFD6C\uFD6E-\uFD6F\uFD71\uFD74-\uFD76\uFD78-\uFD7C\uFD7E-\uFD82\uFD84-\uFD85\uFD87\uFD8B\uFD96-\uFD97\uFD99-\uFD9C\uFD9E-\uFDB3\uFDB6-\uFDB7\uFDB9\uFDBB-\uFDC2\uFDC6-\uFDC7\uFE82\uFE84\uFE86\uFE88\uFE8A\uFE8E\uFE90\uFE94\uFE96\uFE9A\uFE9E\uFEA2\uFEA6\uFEAA\uFEAC\uFEAE\uFEB0\uFEB2\uFEB6\uFEBA\uFEBE\uFEC2\uFEC6\uFECA\uFECE\uFED2\uFED6\uFEDA\uFEDE\uFEE2\uFEE6\uFEEA\uFEEE\uFEF0\uFEF2\uFEF6\uFEF8\uFEFA\uFEFC]$/;
const INITIAL_FORMS = /^[\uFB54\uFB58\uFB5C\uFB60\uFB64\uFB68\uFB6C\uFB70\uFB74\uFB78\uFB7C\uFB80\uFB90\uFB94\uFB98\uFB9C\uFBA2\uFBA8\uFBAC\uFBD5\uFBE6\uFBE8\uFBF8\uFBFB\uFBFE\uFC97-\uFCDE\uFD2D-\uFD33\uFD50\uFD52-\uFD57\uFD59\uFD5C-\uFD5D\uFD60-\uFD61\uFD63\uFD65\uFD68\uFD6B\uFD6D\uFD70\uFD72-\uFD73\uFD77\uFD7D\uFD83\uFD86\uFD88-\uFD8A\uFD8C-\uFD8F\uFD92-\uFD95\uFD98\uFD9D\uFDB4-\uFDB5\uFDB8\uFDBA\uFDC3-\uFDC5\uFE8B\uFE91\uFE97\uFE9B\uFE9F\uFEA3\uFEA7\uFEB3\uFEB7\uFEBB\uFEBF\uFEC3\uFEC7\uFECB\uFECF\uFED3\uFED7\uFEDB\uFEDF\uFEE3\uFEE7\uFEEB\uFEF3]$/;

/** تصويت السطر: كم كلمة مقلوبة مقابل كم كلمة سليمة (حسب أشكال الحروف فقط) */
function visualVotes(strs: string[]): number {
  let v = 0;
  for (const s of strs) {
    for (const w of s.split(/\s+/)) {
      const ch = [...w].filter((c) => /[\uFB50-\uFDFF\uFE70-\uFEFF]/.test(c));
      if (ch.length < 2) continue;
      const first = ch[0];
      const last = ch[ch.length - 1];
      if (FINAL_FORMS.test(first) || INITIAL_FORMS.test(last)) v++;
      if (INITIAL_FORMS.test(first) || FINAL_FORMS.test(last)) v--;
    }
  }
  return v;
}

export type PositionedItem = { str: string; x: number; y: number; w: number; h: number };

const isArabicStr = (s: string) => ARABIC.test(s);
const isLtrStr = (s: string) => /[A-Za-z0-9٠-٩]/.test(s) && !ARABIC.test(s);

/**
 * يبني الأسطر من مواضع العناصر (لا من ترتيب تخزينها): يجمّع حسب y، ويرتّب السطر العربي
 * من اليمين لليسار مع إبقاء مقاطع الأرقام/اللاتيني من اليسار لليمين، ويضع مسافة فقط عند وجود فجوة فعلية.
 */
export function assembleLines(items: PositionedItem[]): string {
  const its = items.filter((i) => i.str.length > 0 && Number.isFinite(i.x) && Number.isFinite(i.y));
  if (its.length === 0) return "";
  its.sort((a, b) => b.y - a.y);
  const lines: PositionedItem[][] = [];
  for (const it of its) {
    const line = lines[lines.length - 1];
    const ref = line?.[0];
    if (ref && Math.abs(ref.y - it.y) <= Math.max(ref.h, it.h, 1) * 0.5) line.push(it);
    else lines.push([it]);
  }
  return lines
    .map((line) => {
      const ar = line.reduce((n, i) => n + (i.str.match(/[؀-ۿ]/g)?.length ?? 0), 0);
      const la = line.reduce((n, i) => n + (i.str.match(/[A-Za-z]/g)?.length ?? 0), 0);
      const rtl = ar > la;
      const sorted = [...line].sort((a, b) => a.x - b.x);
      const ordered = rtl ? sorted.reverse() : sorted;
      const near = (p: PositionedItem, c: PositionedItem) => {
        const gap = c.x >= p.x ? c.x - (p.x + p.w) : p.x - (c.x + c.w);
        return gap <= Math.max(c.h, p.h, 1) * 0.18;
      };
      // كلمات = عناصر متلاصقة بصرياً
      const tokens: PositionedItem[][] = [];
      for (const it of ordered) {
        const last = tokens[tokens.length - 1];
        if (last && near(last[last.length - 1], it) && !it.str.startsWith(" ")) last.push(it);
        else tokens.push([it]);
      }
      let parts = tokens.map((tok) => tok);
      if (rtl) {
        // كلمات عربية مخزّنة مقلوبة داخلياً → اقلب حروف العنصر نفسه (ترتيب العناصر صحّحه الفرز بالموضع)
        if (visualVotes(line.map((i) => i.str)) > 0) {
          parts = parts.map((tok) => tok.map((i) => (isArabicStr(i.str) ? { ...i, str: [...i.str].reverse().join("") } : i)));
        }
        // رقم مع علامة ترقيم مخزّن مرئياً (".12" في آخر جملة عربية) → "12."
        parts = parts.map((tok) => tok.map((i) => (isLtrStr(i.str) ? { ...i, str: i.str.replace(/^([.,:;!?؟،]+)([0-9٠-٩].*)$/, "$2$1") } : i)));
        // كل كلمة أرقام/لاتيني تُقرأ داخلياً يساراً ← يميناً
        parts = parts.map((tok) => (tok.some((i) => isLtrStr(i.str)) && !tok.some((i) => isArabicStr(i.str)) ? [...tok].reverse() : tok));
        // كلمات لاتينية متتالية = عبارة واحدة باتجاهها الطبيعي (الأرقام والعمليات تبقى بترتيب الجملة العربية)
        const latin = (tok: PositionedItem[]) => tok.some((i) => /[A-Za-z]/.test(i.str)) && !tok.some((i) => isArabicStr(i.str));
        const merged: PositionedItem[][][] = [];
        for (const tok of parts) {
          const g = merged[merged.length - 1];
          if (g && latin(tok) && latin(g[g.length - 1])) g.push(tok);
          else merged.push([tok]);
        }
        parts = merged.flatMap((g) => (g.length > 1 ? [...g].reverse() : g));
      }
      return parts.map((tok) => tok.map((i) => i.str).join("")).join(" ").replace(/ +/g, " ");
    })
    .join("\n");
}
