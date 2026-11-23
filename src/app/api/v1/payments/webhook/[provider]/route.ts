import { handleWebhook } from "@/server/billing/card";

export const runtime = "nodejs";

const MAX = 64 * 1024;

/**
 * إشعارات بوابة الدفع (خادم إلى خادم، بلا جلسة). الأمان من التوقيع والختم الزمني وفرادة الحدث داخل handleWebhook،
 * والجسم يُقرأ خاماً (التوقيع على البايتات كما وصلت). 200 للمكرر وغير المعروف حتى لا تعيد البوابة الإرسال بلا نهاية.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX) return Response.json({ error: { code: "TOO_LARGE", message: "Payload too large" } }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX) return Response.json({ error: { code: "TOO_LARGE", message: "Payload too large" } }, { status: 413 });
  const provider = (await params).provider.slice(0, 30);
  try {
    const r = await handleWebhook(provider, raw, req.headers);
    return Response.json({ data: { result: r.result } }, { status: r.status });
  } catch (e) {
    console.error(`[payments] webhook error: ${(e as Error).message.split("\n")[0]}`);
    return Response.json({ error: { code: "WEBHOOK_ERROR", message: "Temporary error" } }, { status: 500 }); // البوابة تعيد المحاولة
  }
}
