import { ok } from "@/server/http";
import { smsAvailable } from "@/server/auth/sms";

export const dynamic = "force-dynamic";
/** القنوات المتاحة فعلياً الآن — لا تُعرض قناة غير مجهّزة كأنها تعمل */
export async function GET() {
  return ok({ email: true, phone: smsAvailable() });
}
