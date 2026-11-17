import "server-only";
import { db } from "../db";

/**
 * Rate limiting بنافذة ثابتة مخزّنة في PostgreSQL (ذرّي عبر upsert واحد).
 * يُرجع false عند تجاوز الحد.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSec}))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN now() + make_interval(secs => ${windowSec}) ELSE "RateLimitBucket"."resetAt" END
    RETURNING "count"`;
  return rows[0].count <= limit;
}

/** تنظيف الحاويات المنتهية (يُستدعى عرضياً) */
export const purgeRateLimits = () => db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date() } } });

export function clientIp(req: Request): string {
  // خلف وكيل موثوق فقط: أول عنوان في x-forwarded-for
  const xff = req.headers.get("x-forwarded-for");
  return (xff?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}
