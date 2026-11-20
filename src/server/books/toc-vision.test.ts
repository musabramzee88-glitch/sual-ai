import { describe, expect, it } from "vitest";
import { offsetFromPrinted } from "./toc-vision";

describe("offsetFromPrinted", () => {
  it("takes the majority offset and ignores impossible readings", () => {
    expect(offsetFromPrinted([{ pdfPage: 3, number: 1 }, { pdfPage: 4, number: 2 }, { pdfPage: 199, number: 197 }])).toBe(2);
    expect(offsetFromPrinted([{ pdfPage: 3, number: 1 }, { pdfPage: 4, number: 1 }])).toBeNull(); // لا أغلبية
    expect(offsetFromPrinted([{ pdfPage: 3, number: 40 }])).toBeNull(); // فرق سالب مستحيل
    expect(offsetFromPrinted([{ pdfPage: 6, number: 6 }])).toBe(0);
    expect(offsetFromPrinted([])).toBeNull();
  });
});
