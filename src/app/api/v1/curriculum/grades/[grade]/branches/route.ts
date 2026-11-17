import { listBranches } from "@/server/curriculum";
import { badCode, codeSchema, ok } from "@/server/http";

export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ grade: string }> }) {
  const grade = codeSchema.safeParse((await params).grade);
  if (!grade.success) return badCode();
  return ok(await listBranches(grade.data), 60);
}
