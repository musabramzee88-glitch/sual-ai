import { badCode, codeSchema, ok } from "@/server/http";
import { listCurricula } from "@/server/curriculum";

export const dynamic = "force-dynamic";

/** GET ?grade=INT_3&track=GENERAL[&subject=MATH][&branch=SCIENTIFIC] */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const grade = codeSchema.safeParse(u.get("grade"));
  const track = codeSchema.safeParse(u.get("track"));
  const subject = u.get("subject") ? codeSchema.safeParse(u.get("subject")) : null;
  const branch = u.get("branch") ? codeSchema.safeParse(u.get("branch")) : null;
  if (!grade.success || !track.success || (subject && !subject.success) || (branch && !branch.success)) return badCode();
  return ok(await listCurricula({ gradeCode: grade.data, trackCode: track.data, subjectCode: subject?.data, branchCode: branch?.data }), 60);
}
