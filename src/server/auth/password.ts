import "server-only";
import argon2 from "argon2";
import { z } from "zod";

const OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (pw: string) => argon2.hash(pw, OPTS);

export async function verifyPassword(hash: string, pw: string) {
  try {
    return await argon2.verify(hash, pw);
  } catch {
    return false;
  }
}

/** هاش وهمي لمعادلة زمن الاستجابة عند عدم وجود المستخدم (يمنع كشف الحسابات بالتوقيت) */
let dummy: Promise<string> | undefined;
export const dummyVerify = async (pw: string) => {
  dummy ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(await dummy, pw);
};

export const passwordSchema = z
  .string()
  .min(10, "WEAK_PASSWORD")
  .max(128, "WEAK_PASSWORD")
  .regex(/[A-Za-z؀-ۿ]/, "WEAK_PASSWORD")
  .regex(/\d/, "WEAK_PASSWORD");
