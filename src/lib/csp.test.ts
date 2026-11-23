import { describe, expect, it } from "vitest";
import { buildCsp, newNonce } from "./csp";

describe("content security policy", () => {
  it("with a nonce, inline scripts are allowed only with that nonce (no unsafe-inline for scripts)", () => {
    const c = buildCsp({ nonce: "abc123" });
    const script = c.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(c).toContain("frame-ancestors 'none'");
    expect(c).toContain("object-src 'none'");
    expect(c).not.toContain("unsafe-eval");
    expect(buildCsp({ nonce: "x", dev: true })).toContain("'unsafe-eval'");
  });
  it("nonces are random and long enough", () => {
    const a = newNonce(), b = newNonce();
    expect(a).not.toBe(b);
    expect(atob(a)).toHaveLength(16);
  });
});
