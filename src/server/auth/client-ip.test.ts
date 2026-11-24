import { describe, expect, it } from "vitest";
import { pickClientIp } from "./client-ip";

describe("pickClientIp", () => {
  it("يأخذ العنوان الذي أضافه الوكيل الموثوق لا ما كتبه العميل", () => {
    expect(pickClientIp("6.6.6.6, 203.0.113.9", null, 1)).toBe("203.0.113.9");
    expect(pickClientIp("6.6.6.6, 198.51.100.1, 10.0.0.2", null, 2)).toBe("198.51.100.1");
  });
  it("تغيير العميل لأول الترويسة لا يغيّر النتيجة", () => {
    const a = pickClientIp("1.1.1.1, 203.0.113.9", null), b = pickClientIp("2.2.2.2, 203.0.113.9", null);
    expect(a).toBe(b);
  });
  it("عنوان واحد أو غياب الترويسة", () => {
    expect(pickClientIp("203.0.113.9", null)).toBe("203.0.113.9");
    expect(pickClientIp(null, "203.0.113.7")).toBe("203.0.113.7");
    expect(pickClientIp(null, null)).toBe("unknown");
    expect(pickClientIp("a, b", null, 5)).toBe("a"); // عدد وكلاء أكبر من القائمة: أبعد عنصر
  });
});
