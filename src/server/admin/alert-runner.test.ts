import { afterAll, describe, expect, it, vi } from "vitest";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { setMailer, type Mail } from "../auth/mailer";

vi.mock("./status", () => ({ systemStatus: vi.fn() }));
vi.mock("../env", async (orig) => {
  const m = await orig<typeof import("../env")>();
  return { ...m, env: { ...m.env, ALERT_EMAIL: "alerts@example.test", APP_URL: "https://sual.example" } };
});
const { systemStatus } = await import("./status");
const { runAlerts } = await import("./alert-runner");
const { env } = await import("../env");
const stateFile = path.join(path.resolve(env.STORAGE_DIR), "alert-state.json");

describe("runAlerts", () => {
  const sent: Mail[] = [];
  setMailer({ send: async (m) => { sent.push(m); } });
  afterAll(async () => { setMailer(undefined); await rm(stateFile, { force: true }); });
  const status = (level: "ok" | "error") => ({ checks: [{ key: "pdf", level, value: level === "ok" ? "يعمل" : "لا يعمل", hint: "ثبّت Chrome" }], overall: level, version: null, uptimeSec: 1, checkedAt: "" });

  it("mails a new fault once, stays quiet while it persists, then mails the recovery", async () => {
    await rm(stateFile, { force: true });
    vi.mocked(systemStatus).mockResolvedValue(status("error") as never);
    expect((await runAlerts(new Date("2026-11-24T10:00:00Z"))).sent).toBe(true);
    expect(sent[0]).toMatchObject({ to: "alerts@example.test" });
    expect(sent[0].subject).toContain("محرّك PDF");
    expect(JSON.parse(await readFile(stateFile, "utf8")).pdf.level).toBe("error");
    expect((await runAlerts(new Date("2026-11-24T11:00:00Z"))).sent).toBe(false);
    vi.mocked(systemStatus).mockResolvedValue(status("ok") as never);
    expect((await runAlerts(new Date("2026-11-24T12:00:00Z"))).sent).toBe(true);
    expect(sent.at(-1)?.text).toContain("عادت للعمل");
    expect(sent).toHaveLength(2);
  });

  it("a failed send keeps the old state so the next hour retries", async () => {
    await rm(stateFile, { force: true });
    vi.mocked(systemStatus).mockResolvedValue(status("error") as never);
    setMailer({ send: async () => { throw new Error("smtp down"); } });
    await expect(runAlerts(new Date("2026-11-24T10:00:00Z"))).rejects.toThrow("smtp down");
    await expect(readFile(stateFile, "utf8")).rejects.toThrow();
  });
});
