import { describe, expect, it } from "vitest";
import { MATH_RUN, latexLite, mathHtml, mathTokens } from "./math-format";
import { richText } from "./exam-render";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const html = (s: string, prose = false) => mathHtml(s, esc, { prose });
const caps = (s: string) => [...s.matchAll(MATH_RUN)].map((m) => m[0]);

describe("powers and subscripts", () => {
  it("renders exponents as superscripts, with a true minus sign", () => {
    expect(html("10^-6")).toBe("10<sup>−6</sup>");
    expect(html("x^2 + y^2")).toBe("x<sup>2</sup> + y<sup>2</sup>");
    expect(html("m^2/C^2")).toBe("m<sup>2</sup>/C<sup>2</sup>");
    expect(html("e^x")).toBe("e<sup>x</sup>");
    expect(html("x^{n+1}")).toBe("x<sup>n+1</sup>");
    expect(html("10^(-3)")).toBe("10<sup>−3</sup>");
    expect(html("(a+b)^2")).toBe("(a+b)<sup>2</sup>");
    expect(html("2.5^1.5")).toBe("2.5<sup>1.5</sup>");
  });
  it("renders subscripts: q_1, v_max, H_2O, x_{12}", () => {
    expect(html("q_1 = q_2")).toBe("q<sub>1</sub> = q<sub>2</sub>");
    expect(html("v_max")).toBe("v<sub>max</sub>");
    expect(html("H_2O")).toBe("H<sub>2</sub>O");
    expect(html("x_{12}")).toBe("x<sub>12</sub>");
  });
  it("a caret or underscore with nothing sensible after it stays as typed", () => {
    expect(html("a ^ b")).toBe("a ^ b");
    expect(html("snake_ case")).toBe("snake_ case");
  });
  it("chemical formulas get subscripts, plain variables do not", () => {
    expect(html("H2O + CO2")).toBe("H<sub>2</sub>O + CO<sub>2</sub>");
    expect(html("2H2SO4")).toBe("2H<sub>2</sub>SO<sub>4</sub>");
    expect(html("Ca(OH)2")).toBe("Ca(OH)<sub>2</sub>");
    expect(html("O2 and N2")).toBe("O<sub>2</sub> and N<sub>2</sub>");
    for (const keep of ["q1 = 5", "x2", "A4 paper", "C2", "B2", "H", "NaCl"]) expect(html(keep), keep).toBe(keep);
  });
});

describe("operators and symbols", () => {
  it("converts typed operators to proper signs", () => {
    expect(html("a <= b")).toBe("a ≤ b".replace(/</g, "&lt;"));
    expect(html("a >= b")).toBe("a ≥ b");
    expect(html("a != b")).toBe("a ≠ b");
    expect(html("x = 5 +- 0.1")).toBe("x = 5 ± 0.1");
    expect(html("A -> B")).toBe("A → B");
    expect(html("A <-> B")).toBe("A ⇌ B");
    expect(html("2 * 3")).toBe("2 × 3");
    expect(html("2*3")).toBe("2 × 3");
    expect(html("3 x 4")).toBe("3 × 4");
    expect(html("sqrt(x)")).toBe("√(x)");
    expect(html("a - b")).toBe("a − b"); // ناقص بين مسافتين
    expect(html("q1 = +2 × 10^-6 C")).toBe("q1 = +2 × 10<sup>−6</sup> C");
  });
  it("spells Greek letters in math runs", () => {
    expect(html("theta = 30°")).toBe("θ = 30°");
    expect(html("Delta t = 2 s")).toBe("Δ t = 2 s");
    expect(html("lambda = v/f")).toBe("λ = v/f");
  });
  it("prose (a pure English text) keeps its words, hyphens and Greek names", () => {
    expect(html("A well - known pi fact", true)).toBe("A well - known pi fact");
    expect(html("It is x^2 here", true)).toBe("It is x<sup>2</sup> here");
  });
  it("escapes everything that is not an exponent or subscript", () => {
    expect(html("a<b & x^2")).toBe("a&lt;b &amp; x<sup>2</sup>");
    expect(html("<script>alert(1)</script>")).not.toContain("<script>");
    expect(html("x^{<img src=x>}")).not.toContain("<img");
  });
});

describe("LaTeX the model might emit", () => {
  it("is turned into the same plain notation", () => {
    expect(latexLite("$x^{2} \\times 3$")).toBe("x^{2} × 3");
    expect(latexLite("\\frac{a+b}{c}")).toBe("(a+b)/c");
    expect(latexLite("\\frac{1}{2}")).toBe("1/2");
    expect(latexLite("\\sqrt{x+1}")).toBe("√(x+1)");
    expect(latexLite("a \\le b \\ge c \\neq d")).toBe("a ≤ b ≥ c ≠ d");
    expect(latexLite("\\alpha + \\theta")).toBe("α + θ");
    expect(latexLite("\\text{km} \\cdot h")).toBe("km · h");
    expect(latexLite("\\unknown{x}")).toBe("unknown{x}");
    expect(latexLite("no latex here")).toBe("no latex here");
  });
  it("end to end: an Arabic sentence with LaTeX shows proper math", () => {
    expect(richText("احسب $2 \\times 10^{-6}$ كولوم")).toContain('<span class="ltr">2 × 10<sup>−6</sup></span>');
  });
});

describe("what counts as a math run inside Arabic text", () => {
  it("captures numbers with units and exponents in one isolated run", () => {
    expect(caps("الشحنة q1 = +2 × 10^-6 C على بعد")).toEqual(["q1 = +2 × 10^-6 C"]);
    expect(caps("ثابت كولوم k = 9 × 10^9 N·m^2/C^2 فقط")).toEqual(["k = 9 × 10^9 N·m^2/C^2"]);
    expect(caps("ما قيمة (a+b)^2 ؟")).toEqual(["(a+b)^2"]);
    expect(caps("الزاوية θ = 30° مع الأفقي")).toEqual(["θ = 30°"]);
    expect(caps("v_max و H_2O")).toEqual(["v_max", "H_2O"]);
    expect(caps("بحيث b != 3 فقط")).toEqual(["b != 3"]);
    expect(caps("ممتاز! جداً")).toEqual([]); // علامة التعجب العربية ليست مقطعاً
    expect(caps("أن الناتج <= 0")).toEqual(["<= 0"]); // علامة المقارنة داخل المقطع فلا تنعكس
    expect(caps("درجة الحرارة -5 °C")).toEqual(["-5 °C"]);
    expect(caps("عندما x = -2 ثم")).toEqual(["x = -2"]);
    expect(caps("الأول - الثاني")).toEqual([]); // شرطة بين كلمتين عربيتين ليست مقطعاً
  });
  it("richText formats runs inside a real sentence and keeps Arabic escaped", () => {
    const h = richText("ناتج 10^-6 × 10^9 يساوي <b>");
    expect(h).toContain('<span class="ltr">10<sup>−6</sup> × 10<sup>9</sup></span>');
    expect(h).toContain("&lt;");
    expect(h).toContain("&gt;");
    expect(h).not.toMatch(/<b[ >]/); // لا وسم حقيقي من النص
  });
  it("a comparison typed after Arabic text becomes ≤ inside one isolated run", () => {
    expect(richText("بيّن أن الناتج <= 0")).toContain('<span class="ltr">≤ 0</span>');
  });
  it("plain math without powers is unchanged (no regression)", () => {
    expect(richText("ناتج 2x + 3x يساوي")).toContain('<span class="ltr">2x + 3x</span>');
  });
  it("tokens never lose characters", () => {
    for (const s of ["10^-6", "H_2O + 2H2O", "x^{n+1} - (a+b)^2", "q_1 * q_2 / r^2", "a <= b -> c", "v_max = sqrt(2*g*h)"]) {
      const flat = mathTokens(s).map((t) => t.s).join("");
      expect(flat.replace(/[−\-]/g, "-").length).toBeGreaterThan(0);
    }
  });
});
