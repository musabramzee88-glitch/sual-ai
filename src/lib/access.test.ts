import { describe, expect, it } from "vitest";
import { canUsePaidServices, resolveAccess, type AccessInput } from "./access";

const now = new Date("2026-11-17T12:00:00Z");
const verified: AccessInput = {
  status: "ACTIVE",
  emailVerifiedAt: now,
  phoneVerifiedAt: now,
  subscription: { status: "ACTIVE", endsAt: new Date("2027-01-01") },
};

describe("resolveAccess", () => {
  it("grants access only to verified users with an unexpired active subscription", () => {
    expect(resolveAccess(verified, now)).toBe("SUBSCRIPTION_ACTIVE");
    expect(canUsePaidServices(verified, now)).toBe(true);
  });
  it("requires BOTH email and phone verification", () => {
    expect(resolveAccess({ ...verified, phoneVerifiedAt: null }, now)).toBe("UNVERIFIED");
    expect(resolveAccess({ ...verified, emailVerifiedAt: null }, now)).toBe("UNVERIFIED");
    expect(resolveAccess({ ...verified, status: "PENDING_VERIFICATION" }, now)).toBe("UNVERIFIED");
  });
  it("bans and suspensions override an active subscription", () => {
    expect(resolveAccess({ ...verified, status: "BANNED" }, now)).toBe("BANNED");
    expect(resolveAccess({ ...verified, status: "SUSPENDED" }, now)).toBe("ACCOUNT_SUSPENDED");
  });
  it("treats an ACTIVE row past its end date (or with no end date) as expired", () => {
    expect(resolveAccess({ ...verified, subscription: { status: "ACTIVE", endsAt: new Date("2026-11-01") } }, now)).toBe("SUBSCRIPTION_EXPIRED");
    expect(resolveAccess({ ...verified, subscription: { status: "ACTIVE", endsAt: null } }, now)).toBe("SUBSCRIPTION_EXPIRED");
  });
  it("maps payment pipeline states", () => {
    expect(resolveAccess({ ...verified, subscription: null }, now)).toBe("AWAITING_PAYMENT");
    expect(resolveAccess({ ...verified, subscription: { status: "PENDING_APPROVAL", endsAt: null } }, now)).toBe("AWAITING_APPROVAL");
    expect(resolveAccess({ ...verified, subscription: { status: "SUSPENDED", endsAt: null } }, now)).toBe("SUBSCRIPTION_SUSPENDED");
    expect(canUsePaidServices({ ...verified, subscription: { status: "PENDING_APPROVAL", endsAt: null } }, now)).toBe(false);
  });
});
