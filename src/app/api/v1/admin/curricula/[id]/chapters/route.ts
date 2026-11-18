import { fail, ok } from "@/server/http";
import { adminMutation, adminRead, respond } from "@/server/admin/route";
import { chaptersSchema, getCurriculumWithChapters, replaceChapters } from "@/server/admin/curriculum";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminRead("MANAGE_CURRICULUM", async () => {
    const c = await getCurriculumWithChapters(id);
    return c ? ok(c) : fail(404, "NOT_FOUND", "Curriculum not found");
  });
}

/** استبدال قائمة الفصول بالترتيب المرسل */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminMutation(req, "MANAGE_CURRICULUM", chaptersSchema, async ({ actor, body }) => respond(await replaceChapters(actor, id, body)));
}
