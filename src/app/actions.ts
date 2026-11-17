"use server";
import { cookies } from "next/headers";
import { locales } from "@/lib/i18n/dictionaries";
import { LOCALE_COOKIE } from "@/lib/i18n/server";

export async function setLocale(formData: FormData) {
  const value = String(formData.get("locale"));
  if (!(locales as readonly string[]).includes(value)) return;
  (await cookies()).set(LOCALE_COOKIE, value, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
}
