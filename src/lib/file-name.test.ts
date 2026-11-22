import { describe, expect, it } from "vitest";
import { contentDisposition, safeFileName } from "./file-name";

describe("safeFileName", () => {
  it("keeps Arabic names and adds .pdf once", () => {
    expect(safeFileName("امتحان الفيزياء الشهري", "x")).toBe("امتحان الفيزياء الشهري.pdf");
    expect(safeFileName("امتحان.pdf", "x")).toBe("امتحان.pdf");
    expect(safeFileName("امتحان.PDF", "x")).toBe("امتحان.pdf");
  });
  it("removes characters Windows forbids, control and hidden direction marks, and path tricks", () => {
    expect(safeFileName('أ/ب\\ج:د*هـ?"و<ز>ح|', "x")).toBe("أ ب ج د هـ و ز ح.pdf");
    expect(safeFileName("../../etc/passwd", "x")).toBe("etc passwd.pdf");
    expect(safeFileName("اسم‮\u0000مخفي\r\nطويل", "x")).toBe("اسممخفيطويل.pdf");
    expect(safeFileName("  ...اسم...  ", "x")).toBe("اسم.pdf");
  });
  it("falls back when empty, blocks reserved names, limits the length", () => {
    expect(safeFileName("", "عنوان الامتحان")).toBe("عنوان الامتحان.pdf");
    expect(safeFileName("///", "")).toBe("exam.pdf");
    expect(safeFileName(null, "x")).toBe("x.pdf");
    expect(safeFileName("CON", "x")).toBe("_CON.pdf");
    expect(safeFileName("nul.pdf", "x")).toBe("_nul.pdf");
    expect(safeFileName("ا".repeat(500), "x").length).toBeLessThanOrEqual(104);
  });
  it("builds a safe Content-Disposition with an ASCII fallback and UTF-8 name", () => {
    const h = contentDisposition("امتحان (1).pdf", "exam-ab12cd.pdf");
    expect(h).toContain('filename="exam-ab12cd.pdf"');
    expect(h).toContain("filename*=UTF-8''%D8%A7%D9%85%D8%AA%D8%AD%D8%A7%D9%86%20%281%29.pdf");
    expect(contentDisposition("a\r\nSet-Cookie: x.pdf", "e.pdf")).not.toMatch(/[\r\n]/);
  });
});
