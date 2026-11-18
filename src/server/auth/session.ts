import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "../db";
import { resolveAccess, type AccessState } from "@/lib/access";
import { hmac, randomToken } from "./crypto";

export const SESSION_COOKIE = "sual_session";
export const DEVICE_COOKIE = "sual_device";
export const SESSION_TTL_MS = 7 * 24 * 3600_000;
export const DEVICE_TTL_MS = 30 * 24 * 3600_000;
const TOUCH_EVERY_MS = 5 * 60_000;

const secure = () => process.env.NODE_ENV === "production";
const cookieOpts = (maxAgeMs: number) => ({ httpOnly: true, secure: secure(), sameSite: "lax" as const, path: "/", maxAge: Math.floor(maxAgeMs / 1000) });

export const sessionHash = (token: string) => hmac("session", token);
export const deviceHash = (token: string) => hmac("device", token);

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string | null }, now = new Date()) {
  const token = randomToken();
  await db.userSession.create({
    data: {
      userId,
      tokenHash: sessionHash(token),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 255),
      mfaPassed: true,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, cookieOpts(SESSION_TTL_MS));
  return token;
}

export async function revokeCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.userSession.updateMany({ where: { tokenHash: sessionHash(token), revokedAt: null }, data: { revokedAt: new Date() } });
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string) {
  const now = new Date();
  await db.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  await db.trustedDevice.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
}

// ───────── الجهاز الموثوق (اختياري وبموافقة المستخدم) ─────────
export async function trustThisDevice(userId: string, userAgent?: string | null, now = new Date()) {
  const token = randomToken();
  await db.trustedDevice.create({
    data: { userId, tokenHash: deviceHash(token), label: userAgent?.slice(0, 120), expiresAt: new Date(now.getTime() + DEVICE_TTL_MS) },
  });
  (await cookies()).set(DEVICE_COOKIE, token, cookieOpts(DEVICE_TTL_MS));
}

export async function isTrustedDevice(userId: string, now = new Date()): Promise<boolean> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token) return false;
  const d = await db.trustedDevice.findUnique({ where: { tokenHash: deviceHash(token) } });
  if (!d || d.userId !== userId || d.revokedAt || d.expiresAt <= now) return false;
  await db.trustedDevice.update({ where: { id: d.id }, data: { lastUsedAt: now } });
  return true;
}

// ───────── قراءة الجلسة الحالية ─────────
export type AuthContext = {
  user: { id: string; fullName: string; email: string; phone: string; role: "TEACHER" | "ADMIN_STAFF" | "SUPER_ADMIN"; locale: "AR" | "EN"; loginSecurity: "SINGLE" | "BOTH"; emailVerified: boolean; phoneVerified: boolean };
  access: AccessState;
};

export async function loadAuth(token: string | undefined, now = new Date()): Promise<AuthContext | null> {
  if (!token) return null;
  const s = await db.userSession.findUnique({
    where: { tokenHash: sessionHash(token) },
    include: { user: { include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 10 } } } },
  });
  if (!s || s.revokedAt || s.expiresAt <= now || !s.mfaPassed) return null;
  const u = s.user;
  if (u.status === "BANNED") return null;
  if (now.getTime() - s.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.userSession.update({ where: { id: s.id }, data: { lastSeenAt: now } });
  }
  // الاشتراك الفعال له الأولوية (طلب تجديد معلّق لا يقطع الخدمة)؛ وإلا الأحدث
  const sub = u.subscriptions.find((x) => x.status === "ACTIVE") ?? u.subscriptions[0];
  return {
    user: { id: u.id, fullName: u.fullName, email: u.email, phone: u.phone, role: u.role, locale: u.locale, loginSecurity: u.loginSecurity, emailVerified: !!u.emailVerifiedAt, phoneVerified: !!u.phoneVerifiedAt },
    access: resolveAccess({ status: u.status, emailVerifiedAt: u.emailVerifiedAt, phoneVerifiedAt: u.phoneVerifiedAt, subscription: sub ? { status: sub.status, endsAt: sub.endsAt } : null }, now),
  };
}

export const getAuth = cache(async () => loadAuth((await cookies()).get(SESSION_COOKIE)?.value));
