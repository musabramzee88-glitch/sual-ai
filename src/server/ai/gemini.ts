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

async function post(path: string, body: unknown, attempts = 5): Promise<unknown> {
  let last: AiError | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return json;
    const msg = (json as { error?: { message?: string } })?.error?.message?.slice(0, 300) ?? `HTTP ${res.status}`;
    if (res.status === 429 || res.status === 500 || res.status === 503) {
      last = new AiError(res.status === 429 ? "QUOTA" : "HTTP", msg);
      // حصة يومية منتهية لا تفيد معها إعادة المحاولة القريبة
      if (res.status === 429 && /per day|daily|PerDay/i.test(msg)) throw last;
      await sleep(retryDelayMs(json) ?? Math.min(60_000, 2000 * 2 ** i));
      continue;
    }
    throw new AiError("HTTP", msg);
  }
  throw last ?? new AiError("HTTP", "فشل الطلب");
}

export async function geminiJson<T>(opts: { prompt: string; images?: Image[]; schema: object; maxOutputTokens?: number; model?: string }): Promise<T> {
  const model = opts.model ?? env.GEMINI_MODEL;
  const parts: object[] = [{ text: opts.prompt }, ...(opts.images ?? []).map((im) => ({ inlineData: { mimeType: im.mime, data: im.data.toString("base64") } }))];
  const res = (await post(`models/${encodeURIComponent(model)}:generateContent`, {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: opts.schema, maxOutputTokens: opts.maxOutputTokens ?? 8192 },
  })) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
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
