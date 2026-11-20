import "server-only";
import { env } from "../env";

/**
 * عميل Gemini عبر REST (بلا SDK). المفتاح يُرسل في ترويسة x-goog-api-key ولا يُطبع أبداً.
 * - geminiJson: طلب بنص وصور JPEG/PNG اختيارية، والرد JSON مقيّد بمخطط (responseSchema).
 * - يعيد المحاولة عند 429/500/503 مع احترام retryDelay الذي يرسله الخادم (حدود المستوى المجاني).
 */
const BASE = "https://generativelanguage.googleapis.com/v1beta";

export class AiError extends Error {
  constructor(public code: "NO_KEY" | "QUOTA" | "BAD_RESPONSE" | "HTTP" | "BLOCKED", message: string) {
    super(message);
    this.name = "AiError";
  }
}

export const geminiAvailable = () => !!env.GEMINI_API_KEY;

type Image = { data: Buffer; mime: "image/jpeg" | "image/png" };

function key(): string {
  if (!env.GEMINI_API_KEY) throw new AiError("NO_KEY", "GEMINI_API_KEY غير معرّف في .env");
  return env.GEMINI_API_KEY;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** مدة الانتظار التي يطلبها الخادم (RetryInfo.retryDelay مثل "27s") */
function retryDelayMs(body: unknown): number | null {
  const details = (body as { error?: { details?: { retryDelay?: string }[] } })?.error?.details ?? [];
  for (const d of details) {
    const m = /^(\d+(?:\.\d+)?)s$/.exec(d.retryDelay ?? "");
    if (m) return Math.ceil(Number(m[1]) * 1000);
  }
  return null;
}

async function post(path: string, body: unknown, attempts = 5, timeoutMs = 180_000): Promise<unknown> {
  let last: AiError | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return json;
    const msg = (json as { error?: { message?: string } })?.error?.message?.slice(0, 300) ?? `HTTP ${res.status}`;
    if (res.status === 429 || res.status === 500 || res.status === 503) {
      last = new AiError(res.status === 429 ? "QUOTA" : "HTTP", msg);
      // حصة يومية منتهية لا تفيد معها إعادة المحاولة القريبة
      if (res.status === 429 && /per day|daily|PerDay/i.test(msg)) throw last;
      if (i + 1 >= attempts) break;
      const wait = retryDelayMs(json) ?? Math.min(60_000, 2000 * 2 ** i);
      // انتظار يطلبه الخادم أطول من دقيقتين = حصة (يومية غالباً) منتهية: لا ننتظر ساعات
      if (res.status === 429 && wait > 120_000) throw new AiError("QUOTA", `${msg} (التجديد بعد ~${Math.round(wait / 3600_000)} ساعة)`);
      // يُطبع حتى لا يبدو الأمر معلّقاً (بلا المفتاح)
      console.warn(`[ai] ${res.status === 429 ? "حدّ الطلبات" : `الخادم مشغول (${res.status})`} — إعادة بعد ${Math.round(wait / 1000)} ث (${i + 1}/${attempts - 1})`);
      await sleep(wait);
      continue;
    }
    throw new AiError("HTTP", msg);
  }
  throw last ?? new AiError("HTTP", "فشل الطلب");
}

/** نماذج نفدت حصتها في هذه الجلسة (لا تُجرَّب ثانية) */
const exhausted = new Set<string>();

/**
 * بلا model صريح: GEMINI_MODEL ثم GEMINI_FALLBACK_MODELS بالترتيب عند نفاد الحصة (لكل نموذج حصته اليومية في المجاني).
 */
export async function geminiJson<T>(opts: { prompt: string; images?: Image[]; schema: object; maxOutputTokens?: number; model?: string; attempts?: number; timeoutMs?: number }): Promise<T> {
  if (opts.model) return geminiJsonWith<T>(opts.model, opts);
  const chain = [env.GEMINI_MODEL, ...(env.GEMINI_FALLBACK_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean)].filter((m, i, a) => a.indexOf(m) === i);
  let last: unknown = null;
  for (const m of chain) {
    if (exhausted.has(m)) continue;
    try {
      return await geminiJsonWith<T>(m, opts);
    } catch (e) {
      if (!(e instanceof AiError && e.code === "QUOTA")) throw e;
      exhausted.add(m);
      last = e;
      if (chain.some((x) => !exhausted.has(x))) console.warn(`[ai] نفدت حصة ${m} — أنتقل إلى النموذج التالي`);
    }
  }
  throw last ?? new AiError("QUOTA", "نفدت حصة كل النماذج");
}

/** النموذج الذي سيُستعمل الآن (لتسجيله مع النتائج المخزنة) */
export const currentModel = () => [env.GEMINI_MODEL, ...(env.GEMINI_FALLBACK_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean)].find((m) => !exhausted.has(m)) ?? env.GEMINI_MODEL;

async function geminiJsonWith<T>(model: string, opts: { prompt: string; images?: Image[]; schema: object; maxOutputTokens?: number; attempts?: number; timeoutMs?: number }): Promise<T> {
  const parts: object[] = [{ text: opts.prompt }, ...(opts.images ?? []).map((im) => ({ inlineData: { mimeType: im.mime, data: im.data.toString("base64") } }))];
  const res = (await post(`models/${encodeURIComponent(model)}:generateContent`, {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: opts.schema, maxOutputTokens: opts.maxOutputTokens ?? 8192 },
  }, opts.attempts ?? 5, opts.timeoutMs ?? 180_000)) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  if (res.promptFeedback?.blockReason) throw new AiError("BLOCKED", res.promptFeedback.blockReason);
  const text = res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiError("BAD_RESPONSE", `رد غير صالح (${res.candidates?.[0]?.finishReason ?? "?"})`);
  }
}

/** النماذج المتاحة لهذا المفتاح التي تدعم generateContent */
export async function listGeminiModels(): Promise<{ name: string; displayName: string }[]> {
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key() }, signal: AbortSignal.timeout(30_000) });
  const json = (await res.json().catch(() => null)) as { models?: { name: string; displayName: string; supportedGenerationMethods?: string[] }[]; error?: { message?: string } } | null;
  if (!res.ok) throw new AiError("HTTP", json?.error?.message?.slice(0, 300) ?? `HTTP ${res.status}`);
  return (json?.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => ({ name: m.name.replace(/^models\//, ""), displayName: m.displayName }));
}
