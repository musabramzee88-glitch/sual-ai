import { ImageResponse } from "next/og";

export const runtime = "nodejs";

/** أيقونة التطبيق: مربع أخضر بعلامة استفهام (نفس شعار الترويسة). الأحجام المسموحة 192 و512 فقط. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (size !== 192 && size !== 512) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b6e6a", color: "#ffffff", fontSize: size * 0.62, fontWeight: 700 }}>
        ?
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=86400" } },
  );
}
