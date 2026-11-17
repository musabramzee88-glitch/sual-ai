import { db } from "@/server/db";
import { fail } from "@/server/http";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch {
    return fail(503, "DB_UNAVAILABLE", "Database unavailable");
  }
}
