import { describe, expect, it } from "vitest";
import { legalDoc } from "./legal";

const base = { email: "support@example.test", whatsapp: "+9647700000000", refundDays: 0, updated: "2026-11-24" };
const text = (d: ReturnType<typeof legalDoc>) => [d.intro, ...d.blocks.flatMap((b) => [b.h, ...(b.p ?? []), ...(b.list ?? [])])].join("\n");

describe("legal pages", () => {
  it("contact details from settings appear in every page and language", () => {
    for (const kind of ["terms", "privacy", "contact"] as const) for (const locale of ["ar", "en"] as const) {
      const t = text(legalDoc(kind, locale, base));
      expect(t).toContain("support@example.test");
      expect(t).toContain("+9647700000000");
    }
  });
  it("without contact settings, no empty lines and a clear fallback", () => {
    const d = legalDoc("contact", "ar", { ...base, email: null, whatsapp: null });
    expect(d.blocks[0].list).toEqual(["ستُضاف طرق التواصل قريباً."]);
  });
  it("refund wording follows REFUND_DAYS", () => {
    expect(text(legalDoc("terms", "ar", base))).toContain("لا يُسترد مبلغ الاشتراك بعد تفعيله");
    expect(text(legalDoc("terms", "ar", { ...base, refundDays: 3 }))).toContain("خلال (3) أيام");
    expect(text(legalDoc("terms", "en", { ...base, refundDays: 7 }))).toContain("within 7 days");
  });
  it("privacy names every outside processor the code uses", () => {
    const t = text(legalDoc("privacy", "ar", base));
    for (const s of ["Gemini", "البريد", "بوابة الدفع"]) expect(t).toContain(s);
  });
});
