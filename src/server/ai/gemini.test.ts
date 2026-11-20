import { afterEach, describe, expect, it, vi } from "vitest";

describe("gemini client", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
  it("sends the key in a header (never the URL), parses JSON, retries on 503 using the server delay", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const calls: { url: string; init: RequestInit }[] = [];
    const replies = [
      new Response(JSON.stringify({ error: { message: "overloaded", details: [{ retryDelay: "0.01s" }] } }), { status: 503 }),
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"answer":"بغداد"}' }] } }] }), { status: 200 }),
    ];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return replies.shift()!; }));
    const { geminiJson } = await import("./gemini");
    const r = await geminiJson<{ answer: string }>({ prompt: "x", schema: { type: "OBJECT" } });
    expect(r.answer).toBe("بغداد");
    expect(calls).toHaveLength(2);
    expect(calls[0].url).not.toContain("test-key");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
  });
  it("stops immediately on an exhausted daily quota", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Quota exceeded for metric: generate_content_free_tier_requests, limit: 50 per day" } }), { status: 429 }));
    vi.stubGlobal("fetch", f);
    const { geminiJson, AiError } = await import("./gemini");
    await expect(geminiJson({ prompt: "x", schema: {} })).rejects.toBeInstanceOf(AiError);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
