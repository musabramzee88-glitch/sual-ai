import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SMTPServer } from "smtp-server";
import { createSmtpMailer, EmailUnavailableError } from "./mailer";

// خادم SMTP حقيقي محلي يلتقط الرسائل — يتحقق من الإرسال والمصادقة فعلياً
const received: { from: string; to: string[]; raw: string; user?: string }[] = [];
let server: SMTPServer;
let port = 0;

beforeAll(async () => {
  server = new SMTPServer({
    authOptional: false,
    allowInsecureAuth: true,
    disabledCommands: ["STARTTLS"],
    onAuth(auth, _s, cb) {
      if (auth.username === "user@test" && auth.password === "app-pass") cb(null, { user: auth.username });
      else cb(new Error("Invalid login"));
    },
    onData(stream, session, cb) {
      let raw = "";
      stream.on("data", (c) => (raw += c));
      stream.on("end", () => {
        received.push({ from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "", to: session.envelope.rcptTo.map((r) => r.address), raw, user: (session as { user?: string }).user });
        cb();
      });
    },
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.server.address() as { port: number }).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const cfg = (over = {}) => ({ host: "127.0.0.1", port, secure: false, requireTLS: false, user: "user@test", pass: "app-pass", from: "Sual AI <no-reply@sual.test>", ...over });

describe("SMTP mailer", () => {
  it("delivers a message with the configured sender", async () => {
    await createSmtpMailer(cfg()).send({ to: "teacher@st.tu.edu.iq", subject: "رمز التحقق", text: "Verification code: 123456" });
    expect(received).toHaveLength(1);
    expect(received[0].to).toEqual(["teacher@st.tu.edu.iq"]);
    expect(received[0].from).toBe("no-reply@sual.test");
    expect(received[0].raw).toContain("123456");
  });

  it("maps auth failures to EmailUnavailableError without leaking credentials", async () => {
    const logs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => void logs.push(a.join(" "));
    try {
      await expect(createSmtpMailer(cfg({ pass: "wrong-secret-xyz" })).send({ to: "a@b.test", subject: "s", text: "Verification code: 654321" })).rejects.toBeInstanceOf(EmailUnavailableError);
    } finally {
      console.error = orig;
    }
    const all = logs.join("\n");
    expect(all).toContain("[mailer] SMTP send failed");
    expect(all).not.toContain("wrong-secret-xyz");
    expect(all).not.toContain("654321");
  });

  it("fails cleanly when the server is unreachable", async () => {
    const orig = console.error;
    console.error = () => {};
    try {
      await expect(createSmtpMailer(cfg({ port: 1 })).send({ to: "a@b.test", subject: "s", text: "x" })).rejects.toBeInstanceOf(EmailUnavailableError);
    } finally {
      console.error = orig;
    }
  });
});
