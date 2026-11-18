import { z } from "zod";
import { fail, ok } from "@/server/http";
import { adminMutation, adminRead, respond } from "@/server/admin/route";
import { adminCurriculumData, createEntity, KINDS, type Kind } from "@/server/admin/curriculum";

const isKind = (k: string): k is Kind => (KINDS as string[]).includes(k);

export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isKind(kind)) return fail(404, "NOT_FOUND", "Unknown kind");
  return adminRead("MANAGE_CURRICULUM", async () => ok((await adminCurriculumData())[kind]));
}

/** الجسم يُتحقق منه داخل الخدمة بمخطط النوع المحدد */
export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isKind(kind)) return fail(404, "NOT_FOUND", "Unknown kind");
  return adminMutation(req, "MANAGE_CURRICULUM", z.record(z.unknown()), async ({ actor, body }) => {
    const r = await createEntity(actor, kind, body);
    return respond(r, r.ok ? { id: r.id } : undefined);
  });
}
