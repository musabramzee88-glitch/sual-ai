import { listStages } from "@/server/curriculum";
import { ok } from "@/server/http";

export const dynamic = "force-dynamic";
export async function GET() {
  return ok(await listStages(), 60);
}
