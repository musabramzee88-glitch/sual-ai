import { fail } from "@/server/http";
import { requireAdmin } from "@/server/admin/guard";
import { getCoverImage } from "@/server/books/cover-image";

export const runtime = "nodejs";

/** صورة غلاف مصغّرة للمراجعة البصرية (للإداريين فقط) */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireAdmin("MANAGE_CURRICULUM");
  if ("res" in g) return g.res;
  try {
    const img = await getCoverImage(id);
    if (!img) return fail(404, "NOT_FOUND", "Book not found");
    return new Response(new Uint8Array(img), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return fail(422, "COVER_UNAVAILABLE", "Cover could not be rendered");
  }
}
