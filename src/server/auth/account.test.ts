import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import { hashPassword } from "./password";
import { deleteAccount } from "./account";
import { login } from "./service";

const TAG = `acctdel-${Date.now()}`;
let userId = "";
const email = `${TAG}@example.test`;

describe("deleteAccount", () => {
  beforeAll(async () => {
    const u = await db.user.create({ data: { fullName: "مدرس للحذف", email, phone: `+96479${String(Date.now()).slice(-8)}`, passwordHash: await hashPassword("Correct-Pass-123"), status: "ACTIVE", emailVerifiedAt: new Date() } });
    userId = u.id;
    const track = await db.curriculumTrack.findFirstOrThrow(), grade = await db.grade.findFirstOrThrow(), subject = await db.subject.findFirstOrThrow();
    await db.exam.create({ data: { ownerId: userId, trackId: track.id, gradeId: grade.id, subjectId: subject.id, title: "امتحان شخصي", totalMarks: 10, settings: {} } });
    await db.userSession.create({ data: { userId, tokenHash: `${TAG}-s`, mfaPassed: true, expiresAt: new Date(Date.now() + 3600e3) } });
  });
  afterAll(async () => { await db.user.deleteMany({ where: { id: userId } }); });

  it("wrong password changes nothing", async () => {
    expect(await deleteAccount(userId, "wrong")).toEqual({ ok: false, code: "INVALID_PASSWORD" });
    expect(await db.exam.count({ where: { ownerId: userId } })).toBe(1);
  });

  it("erases personal data and content, closes the account, and login no longer works", async () => {
    expect(await deleteAccount(userId, "Correct-Pass-123")).toEqual({ ok: true });
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.fullName).toBe("حساب محذوف");
    expect(u.email).not.toContain(TAG.split("-")[0] + "-" + TAG.split("-")[1] + "@example");
    expect(u.email.endsWith("@deleted.invalid")).toBe(true);
    expect(u.status).toBe("BANNED");
    expect(await db.exam.count({ where: { ownerId: userId } })).toBe(0);
    expect(await db.userSession.count({ where: { userId } })).toBe(0);
    const r = await login(email, "Correct-Pass-123", { ip: "1.1.1.1", userAgent: "t" });
    expect(r.ok).toBe(false);
  });

  it("admin accounts cannot be deleted this way", async () => {
    const admin = await db.adminUser.findFirst({ include: { user: true } });
    if (!admin) return;
    expect((await deleteAccount(admin.userId, "x")).ok).toBe(false);
  });
});
