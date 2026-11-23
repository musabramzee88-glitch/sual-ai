import { describe, expect, it } from "vitest";
import { activeTab } from "./nav";

describe("active navigation tab", () => {
  it("highlights the right tab for each page; an open exam belongs to «my exams»", () => {
    expect(activeTab("/dashboard")).toBe("home");
    expect(activeTab("/exams")).toBe("exams");
    expect(activeTab("/exams/abc123")).toBe("exams");
    expect(activeTab("/exams/abc123/print")).toBe("exams");
    expect(activeTab("/exams/new")).toBe("newExam");
    expect(activeTab("/exams/templates")).toBe("templates");
    expect(activeTab("/subscribe")).toBe("subscribe");
    expect(activeTab("/settings/security")).toBe("account");
    expect(activeTab("/admin/users")).toBe("admin");
    expect(activeTab("/")).toBeNull();
  });
});
