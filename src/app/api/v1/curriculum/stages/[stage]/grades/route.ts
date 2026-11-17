import { listGrades } from "@/server/curriculum";
import { badCode, codeSchema, ok } from "@/server/http";

export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ stage: string }> }) {
  const stage = codeSchema.safeParse((await params).stage);
  const trackRaw = new URL(req.url).searchParams.get("track");
  const track = trackRaw === null ? undefined : codeSchema.safeParse(trackRaw);
  if (!stage.success || (track && !track.success)) return badCode();
  return ok(await listGrades(stage.data, track?.data), 60);
}
