import { z } from "zod";
import { fail } from "@/server/http";
import { adminMutation, respond } from "@/server/admin/route";
import { KINDS, updateEntity, type Kind } from "@/server/admin/curriculum";

const isKind = (k: string): k is Kind => (KINDS as string[]).includes(k);

export async function PATCH(req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!isKind(kind)) return fail(404, "NOT_FOUND", "Unknown kind");
  return adminMutation(req, "MANAGE_CURRICULUM", z.record(z.unknown()), async ({ actor, body }) => respond(await updateEntity(actor, kind, id, body)));
}
