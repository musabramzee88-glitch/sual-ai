import { requireExamAccess } from "@/server/exams/access";
import { notFound, respondExam } from "@/server/exams/route";
import { deleteLogo, logoBytes } from "@/server/exams/templates";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const l = await logoBytes(g.auth.user.id, (await params).id);
  if (!l) return notFound();
  return new Response(new Uint8Array(l.bytes), { headers: { "content-type": l.mime, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  return respondExam(await deleteLogo(g.auth.user.id, (await params).id));
}
