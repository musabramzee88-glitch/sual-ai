import { listTracks } from "@/server/curriculum";
import { badCode, codeSchema, ok } from "@/server/http";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("grade");
  const grade = raw === null ? undefined : codeSchema.safeParse(raw);
  if (grade && !grade.success) return badCode();
  return ok(await listTracks(grade?.data), 60);
}
