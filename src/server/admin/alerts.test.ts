import { describe, expect, it } from "vitest";
import { planAlerts, type AlertState } from "./alerts";
import type { Check } from "./status-rules";

const ok = (key: string): Check => ({ key, level: "ok", value: "سليم" });
const bad = (key: string, level: "warn" | "error" = "error"): Check => ({ key, level, value: "لا يعمل", hint: "افعل كذا" });
const t0 = new Date("2026-11-24T10:00:00Z");
const at = (h: number) => new Date(t0.getTime() + h * 3600e3);

describe("planAlerts", () => {
  it("all fine and nothing before: no mail", () => {
    expect(planAlerts([ok("db"), ok("pdf")], {}, t0)).toEqual({ mail: null, next: {} });
  });

  it("a new problem sends one mail naming it with what to do", () => {
    const p = planAlerts([ok("db"), bad("pdf")], {}, t0, { site: "https://sual.example" });
    expect(p.mail?.subject).toContain("عطل");
    expect(p.mail?.subject).toContain("محرّك PDF");
    expect(p.mail?.text).toContain("ماذا تفعل: افعل كذا");
    expect(p.mail?.text).toContain("https://sual.example/admin/status");
    expect(p.next.pdf).toMatchObject({ level: "error" });
  });

  it("the same problem is not repeated within 24h, then reminded once a day", () => {
    const s1 = planAlerts([bad("pdf")], {}, t0).next;
    const p2 = planAlerts([bad("pdf")], s1, at(1));
    expect(p2.mail).toBeNull();
    const p3 = planAlerts([bad("pdf")], p2.next, at(24));
    expect(p3.mail?.text).toContain("ما زالت قائمة");
    expect(planAlerts([bad("pdf")], p3.next, at(30)).mail).toBeNull();
  });

  it("warn becoming error alerts again immediately", () => {
    const s1 = planAlerts([bad("backup", "warn")], {}, t0).next;
    const p = planAlerts([bad("backup", "error")], s1, at(1));
    expect(p.mail?.text).toContain("مشاكل جديدة");
    expect(p.next.backup.since).toBe(t0.toISOString());
  });

  it("recovery sends a 'back to normal' mail once and clears the state", () => {
    const s1 = planAlerts([bad("db")], {}, t0).next;
    const p = planAlerts([ok("db")], s1, at(2));
    expect(p.mail?.subject).toContain("تم الإصلاح");
    expect(p.mail?.text).toContain("عادت للعمل");
    expect(p.next).toEqual({});
    expect(planAlerts([ok("db")], p.next, at(3)).mail).toBeNull();
  });

  it("several changes go in one mail", () => {
    const s1: AlertState = { db: { level: "error", since: t0.toISOString(), lastSent: t0.toISOString() } };
    const p = planAlerts([ok("db"), bad("disk", "warn")], s1, at(1));
    expect(p.mail?.text).toContain("مشاكل جديدة");
    expect(p.mail?.text).toContain("عادت للعمل");
  });
});
