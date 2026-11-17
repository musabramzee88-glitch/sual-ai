import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

/** رمز مرجعي: أحرف كبيرة وأرقام وشرطة سفلية فقط */
export const codeSchema = z.string().regex(/^[A-Z0-9_]{1,32}$/);

export const ok = <T>(data: T, cacheSeconds = 0) =>
  NextResponse.json(
    { data },
    { headers: cacheSeconds ? { "Cache-Control": `public, max-age=${cacheSeconds}, stale-while-revalidate=600` } : {} },
  );

export const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

export const badCode = () => fail(400, "INVALID_CODE", "Invalid reference code");
