/**
 * تنسيق التعابير الرياضية والعلمية (دوال نقية، مصدر واحد للورقة وPDF وWord والمحرر).
 * النموذج والمدرس يكتبان بصيغة نصية بسيطة (x^2، 10^-6، q_1، H_2O، sqrt(x)، *، <=) فتُعرض رياضياً:
 * أسس مرفوعة وأدلّة مخفوضة وعلامات صحيحة (× − ≤ ≥ ≠ ± → √ π ...) بدل النص الخام.
 * ولو كتب النموذج LaTeX بسيطاً ($x^{2}$، \times، \frac{a}{b}) يُحوَّل إلى النص نفسه أولاً.
 * لا يعدّل إلا مقاطع لاتينية/رياضية (تُعزل بـ ltr)، ولا يمسّ العربية.
 */

/** مقطع لاتيني/رياضي داخل نص: يبدأ بحرف أو رقم أو قوس، وقد يحوي عمليات ورموزاً يونانية */
const GREEK = "αβγδεζηθικλμνξοπρστυφχψωΔΘΛΞΠΣΦΨΩ";
const MID = `A-Za-z0-9\\s+\\-−×÷·=*/^_().,√<>!≤≥≠≈±∞°→⇌²³%[\\]{}|'${GREEK}`;
export const MATH_RUN = new RegExp(`(?:[<>!≤≥≠≈=]+\\s*)?(?:[-−+](?=[0-9.]))?(?:[(\\[√±]*[A-Za-z0-9${GREEK}][${MID}]*[A-Za-z0-9)²³%\\]}|'°${GREEK}]|[A-Za-z0-9${GREEK}])`, "gu");

const GREEK_NAMES: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", theta: "θ", lambda: "λ", mu: "μ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", omega: "ω",
  Delta: "Δ", Theta: "Θ", Lambda: "Λ", Sigma: "Σ", Phi: "Φ", Omega: "Ω",
};

/** LaTeX بسيط → نص عادي (يُطبَّق على النص كله قبل تقسيمه، لأن \ و$ خارج مقاطع الرياضيات) */
export function latexLite(text: string): string {
  if (!/[\\$]/.test(text)) return text;
  let s = text;
  const rep: [RegExp, string][] = [
    [/\\times\b/g, "×"], [/\\cdot\b/g, "·"], [/\\div\b/g, "÷"], [/\\pm\b/g, "±"], [/\\mp\b/g, "∓"], [/\\leq?\b/g, "≤"], [/\\geq?\b/g, "≥"], [/\\neq?\b/g, "≠"],
    [/\\approx\b/g, "≈"], [/\\infty\b/g, "∞"], [/\\(?:rightarrow|to)\b/g, "→"], [/\\rightleftharpoons\b/g, "⇌"], [/\\circ\b/g, "°"], [/\\degree\b/g, "°"],
    [/\\(?:left|right)\s*/g, ""], [/\\[,;:! ]/g, " "], [/\\(?:displaystyle|limits)\b/g, ""],
  ];
  for (const [re, to] of rep) s = s.replace(re, to);
  for (const [name, ch] of Object.entries(GREEK_NAMES)) s = s.replace(new RegExp(`\\\\${name}\\b`, "g"), ch);
  s = s.replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, "$1");
  s = s.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)");
  // \frac{a}{b}: كسر بسيط → a/b، وإن كان فيه عمليات يُقوَّس
  for (let i = 0; i < 3; i++) s = s.replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) => `${/^[\w.]+$/.test(a) ? a : `(${a})`}/${/^[\w.]+$/.test(b) ? b : `(${b})`}`);
  s = s.replace(/\$\$?|\\\(|\\\)|\\\[|\\\]/g, "");
  return s.replace(/\\([A-Za-z]+)/g, "$1"); // أمر غير معروف: يبقى اسمه حروفاً بدل شرطة مائلة خام
}

export type MathToken = { t: "text" | "sup" | "sub"; s: string };

const ELEMENTS = new Set(("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Ag Cd Sn Sb I Xe Cs Ba Au Hg Pb Bi U").split(" "));
const DIATOMIC = new Set(["H2", "N2", "O2", "F2", "Cl2", "Br2", "I2"]);

/** معادلة/صيغة كيميائية: كل أجزاؤها رموز عناصر بأعداد (H2O, CO2, H2SO4, Ca(OH)2) فتُخفض أعدادها */
function chemical(tok: string): boolean {
  if (!/\d/.test(tok)) return false;
  if (DIATOMIC.has(tok)) return true;
  const groups = tok.match(/[A-Z][a-z]?|\(|\)|\d+/g);
  if (!groups || groups.join("") !== tok) return false;
  const syms = groups.filter((g) => /^[A-Z]/.test(g));
  return syms.length >= 2 && syms.every((g) => ELEMENTS.has(g));
}

/** المقطع الرياضي → رموز: نص عادي/أس/دليل. المدخل مقطع لاتيني واحد (ليس نصاً عربياً). */
export function mathTokens(run: string, opts: { prose?: boolean } = {}): MathToken[] {
  let s = run;
  // عمليات ورموز
  s = s.replace(/<=/g, "≤").replace(/>=/g, "≥").replace(/!=/g, "≠").replace(/\+-/g, "±").replace(/<->/g, "⇌").replace(/->/g, "→").replace(/~=/g, "≈");
  s = s.replace(/\*/g, "×").replace(/\bsqrt\s*\(/g, "√(").replace(/\bsqrt\s+(?=[\w(])/g, "√");
  if (!opts.prose) s = s.replace(/(?<=\s)-(?=\s)/g, "−"); // ناقص بين مسافتين = علامة طرح (لا في نثر إنكليزي)
  s = s.replace(/(?<=\d)\s*[xX]\s*(?=\d)/g, " × "); // 3 x 4
  if (!opts.prose) s = s.replace(/\b(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|rho|sigma|tau|phi|omega|Delta|Theta|Lambda|Sigma|Phi|Omega)\b/g, (m) => GREEK_NAMES[m] ?? m);
  // المسافات حول × تُوحَّد: 2×10 → 2 × 10 (ما لم يكن فيها مسافة أصلاً)
  s = s.replace(/(?<=[\w)])×(?=[\w(])/g, " × ");
  const out: MathToken[] = [];
  const push = (t: MathToken["t"], str: string) => {
    if (!str) return;
    const last = out[out.length - 1];
    if (last && last.t === t) last.s += str;
    else out.push({ t, s: str });
  };
  let i = 0;
  let word = ""; // آخر كلمة نصية (لكشف الصيغ الكيميائية)
  const flushWord = () => {
    if (!word) return;
    const lead = /^\d+/.exec(word)?.[0] ?? ""; // 2H2O: العدد الأول معامل لا دليل
    const body = word.slice(lead.length);
    if (chemical(body)) {
      push("text", lead);
      for (const m of body.matchAll(/([A-Z][a-z]?|\(|\))|(\d+)/g)) {
        if (m[2] !== undefined) push("sub", m[2]);
        else push("text", m[1]);
      }
    } else push("text", word);
    word = "";
  };
  while (i < s.length) {
    const c = s[i];
    if (c === "^" || c === "_") {
      flushWord();
      const rest = s.slice(i + 1);
      let arg = "";
      let used = 0;
      if (rest[0] === "{") {
        const end = rest.indexOf("}");
        if (end > 0) { arg = rest.slice(1, end); used = end + 1; }
      } else if (c === "^") {
        const num = /^[-+−]?\d+(?:\.\d+)?/.exec(rest), par = /^\(([^()]*)\)/.exec(rest), letter = /^[-+−]?[A-Za-z]/.exec(rest);
        if (num) { arg = num[0]; used = arg.length; }
        else if (par) { arg = par[1]; used = par[0].length; }
        else if (letter) { arg = letter[0]; used = arg.length; }
      } else {
        const sub = /^\d+/.exec(rest) ?? /^[A-Za-z][A-Za-z0-9]*/.exec(rest);
        if (sub) { arg = sub[0]; used = arg.length; }
      }
      i += 1 + used;
      if (arg) push(c === "^" ? "sup" : "sub", arg.replace(/-/g, "−"));
      else push("text", c);
      continue;
    }
    if (/[A-Za-z0-9()]/.test(c)) { word += c; i++; continue; }
    flushWord();
    push("text", c);
    i++;
  }
  flushWord();
  return out;
}

/** HTML آمن لمقطع رياضي: النص مهرَّب، والأس والدليل وسوم sup/sub فقط */
export function mathHtml(run: string, esc: (s: string) => string, opts: { prose?: boolean } = {}): string {
  const toks = mathTokens(run, opts);
  if (toks.every((t) => t.t === "text") && toks.map((t) => t.s).join("") === run) return esc(run);
  return toks.map((t) => (t.t === "text" ? esc(t.s) : `<${t.t}>${esc(t.s)}</${t.t}>`)).join("");
}
