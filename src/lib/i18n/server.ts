import "server-only";
import { cookies } from "next/headers";
import { defaultLocale, dictionaries, locales, type Locale } from "./dictionaries";

export const LOCALE_COOKIE = "locale";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return (locales as readonly string[]).includes(v ?? "") ? (v as Locale) : defaultLocale;
}

export async function getDictionary() {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale] };
}
