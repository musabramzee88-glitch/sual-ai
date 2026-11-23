import { MATH_RUN, latexLite, mathTokens } from "@/lib/math-format";

/**
 * نص سؤال قد يخلط العربية بتعابير رياضية/لاتينية: تُعزل المقاطع اللاتينية/الرقمية بـ dir="ltr" + unicode-bidi: isolate
 * (قاعدة المشروع) وتُنسَّق رياضياً (أس، دليل، × − ≤ ≥ ...) بالدوال نفسها التي تستعملها الورقة (math-format). مكوّن نقي بلا حالة.
 */
function Tokens({ run, prose }: { run: string; prose?: boolean }) {
  return <>{mathTokens(run, { prose }).map((t, i) => (t.t === "sup" ? <sup key={i}>{t.s}</sup> : t.t === "sub" ? <sub key={i}>{t.s}</sub> : t.s))}</>;
}

export function MathText({ text: raw, className }: { text: string; className?: string }) {
  const text = latexLite(raw);
  if (!/[\u0600-\u06FF]/.test(text)) return <span className={`whitespace-pre-line ${className ?? ""}`} dir="auto"><Tokens run={text} prose /></span>;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MATH_RUN)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    parts.push(<span key={i} dir="ltr" className="[unicode-bidi:isolate] whitespace-nowrap"><Tokens run={m[0]} /></span>);
    last = i + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={`whitespace-pre-line ${className ?? ""}`}>{parts}</span>;
}
