import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE, HEADER_KEYS, renderExamHtml, type RenderExam } from "./exam-render";
import { modelOf } from "./exam-models";

/** كل نص في الورقة يأتي من النموذج أو المدرس: يجب ألا يصير وسماً أو سمة أو رابطاً في أي نسخة أو نموذج */
const NASTY = ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "\"><svg onload=alert(1)>", "'><iframe src=javascript:alert(1)>", "</style><script>x</script>", "<a href=\"javascript:alert(1)\">x</a>",
  "x^<b>2</b>", "H_<i>2</i>O", "$\\frac{<img>}{2}$", "sqrt(<x>)", "&lt;script&gt;", "]]><!--", "{{7*7}}", "\\text{<script>}", "a <= b && c", "q_{<svg>}", "10^{\"onmouseover=1}"];
function rng(seed: number) { return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31); }

const ALLOWED = new Set(["html", "head", "meta", "title", "style", "body", "div", "section", "header", "footer", "main", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "colgroup", "col", "ol", "ul", "li", "p", "span", "b", "strong", "i", "em", "sup", "sub", "br", "hr", "h1", "h2", "h3", "img", "small", "label"]);

describe("renderExamHtml — لا حقن HTML من أي حقل", () => {
  it("مدخلات عدائية عشوائية في كل الحقول وكل النسخ والنماذج", () => {
    const r = rng(3);
    const pick = () => Array.from({ length: 1 + Math.floor(r() * 3) }, () => (r() < 0.6 ? NASTY[Math.floor(r() * NASTY.length)] : "نص عادي x^2 ")).join(" ");
    const bad: string[] = [];
    for (let t = 0; t < 150; t++) {
      const exam: RenderExam = {
        lang: r() < 0.5 ? "AR" : "EN",
        values: Object.fromEntries(HEADER_KEYS.map((k) => [k, pick()])),
        forceShow: [...HEADER_KEYS],
        sectionsToAnswer: r() < 0.3 ? 1 : null,
        sections: Array.from({ length: 2 }, (_, i) => ({
          instruction: pick(), marks: 10, type: i ? "TRUE_FALSE" : "MCQ", answerCount: r() < 0.3 ? 1 : null,
          branches: Array.from({ length: 3 }, () => ({
            prompt: pick(), marks: 5, answer: pick(), options: i ? null : [pick(), pick(), pick()],
            image: r() < 0.2 ? (r() < 0.5 ? "javascript:alert(1)" : "data:text/html,<script>x</script>") : null,
            table: r() < 0.3 ? { header: true, cells: [[pick(), pick()], [pick(), pick()]] } : null,
          })),
        })),
      };
      const tpl = { ...DEFAULT_TEMPLATE, footerNote: pick(), accent: r() < 0.5 ? "red;}</style><script>" : "#123456" };
      for (const model of ["A", "B"] as const) for (const v of ["QUESTIONS_ONLY", "WITH_ANSWERS", "ANSWER_KEY", "ANSWER_SHEET"] as const) for (const forPdf of [true, false]) {
        const html = renderExamHtml(modelOf(exam, model, `e${t}`), tpl, v, { forPdf });
        for (const m of html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)) {
          const [, tag, attrs] = m;
          if (!ALLOWED.has(tag.toLowerCase())) bad.push(`tag <${tag}> in ${v}`);
          if (/\son[a-z]+\s*=/i.test(attrs)) bad.push(`event attr in <${tag}${attrs.slice(0, 40)}>`);
          if (/javascript:|data:text/i.test(attrs)) bad.push(`bad url in <${tag}${attrs.slice(0, 60)}>`);
          if (tag.toLowerCase() === "img" && !/src="data:image\/(png|jpeg);base64,/.test(attrs)) bad.push(`img src ${attrs.slice(0, 60)}`);
        }
        const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((x) => x[1]).join("");
        if (/<script|<\/style/i.test(styles)) bad.push("style breakout");
      }
    }
    expect([...new Set(bad)].slice(0, 10)).toEqual([]);
  });
});
