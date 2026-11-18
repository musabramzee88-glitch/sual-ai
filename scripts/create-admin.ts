/**
 * إنشاء/ترقية المدير الرئيسي من سطر الأوامر على الخادم:
 *   npm run admin:create -- --email you@example.com --phone 07701234567 --name "الاسم"
 * كلمة المرور تُقرأ من ADMIN_PASSWORD أو تُطلب بإخفاء الإدخال — لا تُكتب في الكود ولا في السجلات.
 * إن كان البريد مسجّلاً أصلاً يُرقّى حسابه دون تغيير كلمة مروره.
 */
import { PrismaClient, AdminPermission } from "@prisma/client";
import argon2 from "argon2";
import { createInterface } from "node:readline";

// نفس معاملات src/server/auth/password.ts
const OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

function normalizePhone(raw: string): string | null {
  let n = raw.replace(/[\s\-()]/g, "");
  if (n.startsWith("00")) n = "+" + n.slice(2);
  else if (n.startsWith("07")) n = "+964" + n.slice(1);
  else if (n.startsWith("7")) n = "+964" + n;
  else if (n.startsWith("964")) n = "+" + n;
  return /^\+9647\d{9}$/.test(n) ? n : null;
}

function askHidden(q: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const w = (rl as unknown as { _writeToOutput: (s: string) => void });
    w._writeToOutput = (s: string) => { if (s.includes(q)) process.stdout.write(s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const phone = arg("phone") ? normalizePhone(arg("phone")!) : null;
  const name = arg("name")?.trim();
  if (!email || !email.includes("@")) throw new Error("--email is required");
  const db = new PrismaClient();
  try {
    const existing = await db.user.findUnique({ where: { email } });
    const now = new Date();
    let userId: string;
    if (existing) {
      userId = existing.id;
      await db.user.update({ where: { id: userId }, data: { role: "SUPER_ADMIN", status: "ACTIVE", emailVerifiedAt: existing.emailVerifiedAt ?? now, phoneVerifiedAt: existing.phoneVerifiedAt ?? now } });
    } else {
      if (!phone) throw new Error("--phone (Iraqi mobile) is required for a new account");
      if (!name || name.length < 3) throw new Error("--name is required for a new account");
      const password = process.env.ADMIN_PASSWORD ?? (await askHidden("Password (min 10 chars, letter + digit): "));
      if (password.length < 10 || !/[A-Za-z؀-ۿ]/.test(password) || !/\d/.test(password)) throw new Error("Weak password");
      const u = await db.user.create({
        data: { fullName: name, email, phone, passwordHash: await argon2.hash(password, OPTS), passwordChangedAt: now, role: "SUPER_ADMIN", status: "ACTIVE", emailVerifiedAt: now, phoneVerifiedAt: now },
      });
      userId = u.id;
    }
    const perms = Object.values(AdminPermission);
    await db.adminUser.upsert({ where: { userId }, create: { userId, permissions: perms }, update: { permissions: perms, isActive: true } });
    console.log(`Super admin ready: ${email}`);
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
